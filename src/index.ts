#!/usr/bin/env node
/**
 * Vision Test Harness — MCP server entry point + CLI.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, TestRunParams, InspectViewParams, ScreenshotParams, CompareScreenshotsParams, GenerateCwsAssetsParams, SeedTestDataParams, ListTestSuitesParams } from './tools.js';
import { runSuite } from './runner/suite-runner.js';
import { compareImages } from './screenshot/diff.js';
import { generateHtmlReport } from './report/html-report.js';
import { diagnoseScreenshot } from './handlers/inspect-view.js';
import { getStatus, getConfig, configureByok, clearByok } from './client.js';
import { generateBadgeSvg, generateMarkdownBadge } from './badge.js';
import { parse as parseYaml } from 'yaml';
import { TestSuiteSchema } from './schema.js';
import { connectToChrome } from './browser/chrome-connect.js';
import { applyPrivacyOverlay } from './browser/privacy-overlay.js';
import fs from 'fs';
import path from 'path';

// ─── Load suite from YAML ─────────────────────────────────────────────────────

function loadSuite(suiteName: string, directory = './test-suites') {
  const candidates = [
    path.join(directory, `${suiteName}.yaml`),
    path.join(directory, `${suiteName}.yml`),
    path.join(directory, suiteName, 'suite.yaml'),
    path.join(directory, suiteName, 'suite.yml'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = parseYaml(fs.readFileSync(candidate, 'utf8'));
      return TestSuiteSchema.parse(raw);
    }
  }
  throw new Error(`Test suite "${suiteName}" not found in ${directory}`);
}

// ─── List suites ──────────────────────────────────────────────────────────────

function listSuites(directory = './test-suites'): Array<{ name: string; type: string; description?: string }> {
  if (!fs.existsSync(directory)) return [];
  const results: Array<{ name: string; type: string; description?: string }> = [];

  const scan = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
        try {
          const raw = parseYaml(fs.readFileSync(full, 'utf8'));
          const suite = TestSuiteSchema.parse(raw);
          results.push({ name: suite.name, type: suite.type, description: suite.description });
        } catch { /* skip invalid */ }
      } else if (entry.isDirectory()) {
        scan(full);
      }
    }
  };

  scan(directory);
  return results;
}

// ─── Generate CWS assets ──────────────────────────────────────────────────────

async function generateCwsAssets(suiteName: string, outputDir = '__marketing__'): Promise<string> {
  const suite = loadSuite(suiteName);
  const reportDir = path.join('__reports__', suite.name);
  const screenshotDir = path.join(reportDir, 'screenshots');
  const mktDir = path.join(outputDir, suite.name);

  fs.mkdirSync(mktDir, { recursive: true });

  const assets = suite.cws_assets ?? [];
  const copied: string[] = [];

  for (const asset of assets) {
    const src = path.join(screenshotDir, `${asset.screenshot}.png`);
    if (!fs.existsSync(src)) {
      copied.push(`MISSING: ${asset.screenshot}`);
      continue;
    }
    const dest = path.join(mktDir, `${asset.screenshot}.png`);
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }

  // Generate HTML index
  const indexHtml = `<!DOCTYPE html><html><body>
<h1>${suite.name} — Chrome Web Store Assets</h1>
<ul>${assets.map((a, i) => `<li><img src="${a.screenshot}.png" style="max-width:1280px" /><p>${a.caption ?? ''}</p></li>`).join('')}</ul>
</body></html>`;
  fs.writeFileSync(path.join(mktDir, 'index.html'), indexHtml);

  return `Generated ${copied.length} assets in ${mktDir}`;
}

// ─── CLI: init ───────────────────────────────────────────────────────────────

async function cliInit(args: string[]): Promise<void> {
  const name = args[0] ?? 'my-app';
  const dir = './test-suites';
  const filePath = path.join(dir, `${name}.yaml`);

  if (fs.existsSync(filePath)) {
    console.error(`Test suite already exists: ${filePath}`);
    console.log(`Run it with: vision-test-harness run ${name}`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });

  const template = `# ${name} — Vision Test Harness suite
# Docs: https://upgpt.ai/tools/test-harness
#
# Run this suite:
#   vision-test-harness run ${name}

name: ${name}
type: web-app
base_url: https://example.com    # ← Replace with your URL
viewport: { width: 1280, height: 800 }

flows:
  - name: homepage
    steps:
      # Navigate to the homepage
      - action: navigate
        url: /
        waitUntil: networkidle

      # Take a screenshot
      - action: screenshot
        name: homepage

      # Verify the page loaded
      - action: assert_element
        selector: "nav"
        visible: true

      # Check for expected text
      # - action: assert_text
      #   selector: "h1"
      #   text: "Welcome"
      #   contains: true

  # - name: login-flow
  #   steps:
  #     - action: navigate
  #       url: /login
  #     - action: type
  #       selector: "input[name=email]"
  #       text: "test@example.com"
  #     - action: type
  #       selector: "input[name=password]"
  #       text: "password123"
  #     - action: click
  #       selector: "button[type=submit]"
  #     - action: wait
  #       selector: "[data-testid=dashboard]"
  #     - action: screenshot
  #       name: dashboard

# Step types: navigate, click, type, wait, assert_text, assert_element,
# screenshot, compare, evaluate, privacy_overlay, wp_login, wp_activate_plugin,
# wp_navigate_admin, wp_assert_notice, open_side_panel, wait_for_content_script
`;

  fs.writeFileSync(filePath, template, 'utf8');

  console.log(`Created: ${filePath}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit ${filePath} — set your base_url and add flows`);
  console.log(`  2. vision-test-harness run ${name}`);
  console.log('');
  console.log('The YAML file has a working example and a commented-out login flow.');
  console.log('Uncomment and customize the parts you need.');
}

// ─── CLI: run ─────────────────────────────────────────────────────────────────

async function cliRun(args: string[]): Promise<void> {
  const suiteName = args[0];
  const flowFilter = args[1];
  const updateBaselines = args.includes('--update-baselines');

  if (!suiteName) {
    console.error('Usage: vision-test-harness run <suite> [flow] [--update-baselines]');
    process.exit(1);
  }

  const suite = loadSuite(suiteName);
  const result = await runSuite(suite, { flowFilter, updateBaselines });

  const reportPath = path.join('__reports__', suite.name, 'report.html');
  generateHtmlReport(result, reportPath);
  console.log(`\nReport: ${reportPath}`);
  console.log(`Status: ${result.status.toUpperCase()} (${result.flows.filter((f) => f.status === 'pass').length}/${result.flows.length} flows)`);

  if (result.status === 'fail') process.exit(1);
}

// ─── CLI: connect (live Chrome + privacy overlay) ────────────────────────────

async function cliConnect(args: string[]): Promise<void> {
  const { browser, context } = await connectToChrome();
  const pages = context.pages();
  const page = pages[0] ?? await context.newPage();

  console.log('Connected to Chrome. Current URL:', page.url());
  console.log('Use Ctrl+C to disconnect.');

  // Keep alive
  await new Promise(() => {});
}

// ─── CLI: capture (marketing screenshots with privacy overlay) ────────────────

async function cliCapture(args: string[]): Promise<void> {
  const preset = (args[0] ?? 'gmail') as 'gmail' | 'wordpress-admin' | 'shopify-admin' | 'generic';
  const outputName = args[1] ?? `capture-${Date.now()}`;

  const { context } = await connectToChrome();
  const pages = context.pages();
  const page = pages[0] ?? await context.newPage();

  // Apply privacy overlay
  const overlayResult = await applyPrivacyOverlay(page, { preset });
  console.log(`Privacy overlay applied: ${overlayResult.replaced} replacements, ${overlayResult.hidden} hidden`);

  // Take screenshot
  const outputDir = '__marketing__/captures';
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${outputName}.png`);
  await page.screenshot({ path: outputPath, fullPage: false });

  console.log(`Screenshot saved: ${outputPath}`);
  await context.close();
}

// ─── MCP server ───────────────────────────────────────────────────────────────

async function startServer(): Promise<void> {
  const server = new Server(
    { name: 'vision-test-harness', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: { type: 'object' as const, properties: {}, additionalProperties: true },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list_test_suites': {
          const params = ListTestSuitesParams.parse(args ?? {});
          const suites = listSuites(params.directory);
          return { content: [{ type: 'text' as const, text: JSON.stringify(suites, null, 2) }] };
        }

        case 'test_run': {
          const params = TestRunParams.parse(args);
          const suite = loadSuite(params.suite);
          const result = await runSuite(suite, {
            flowFilter: params.flow,
            updateBaselines: params.update_baselines,
          });
          const reportPath = path.join('__reports__', suite.name, 'report.html');
          generateHtmlReport(result, reportPath);

          const response: Record<string, unknown> = { ...result, report_path: reportPath };

          const mcpFailedFlows = result.flows.filter((f: { status: string }) => f.status === 'fail');
          if (mcpFailedFlows.length > 0) {
            response.inspect_hint = `${mcpFailedFlows.length} flow(s) failed. Call inspect_view with a screenshot_path from the results to get AI diagnosis.`;
          }

          return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] };
        }

        case 'inspect_view': {
          const params = InspectViewParams.parse(args ?? {});
          if (params.screenshot_path) {
            const diagnosis = await diagnoseScreenshot(params.screenshot_path, {
              console_errors: params.console_errors,
              source_file: params.source_file,
            });
            return { content: [{ type: 'text' as const, text: JSON.stringify(diagnosis, null, 2) }] };
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Pass screenshot_path to analyze a saved screenshot, or use CLI: vision-test-harness connect for live inspection.' }) }] };
        }

        case 'screenshot': {
          const params = ScreenshotParams.parse(args);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ name: params.name, status: 'requires active session' }) }] };
        }

        case 'compare_screenshots': {
          const params = CompareScreenshotsParams.parse(args);
          const diff = await compareImages(params.baseline, params.current, params.output, 0.1);
          const pass = diff.diffPercent <= (params.threshold ?? 5);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ...diff, pass }) }] };
        }

        case 'generate_cws_assets': {
          const params = GenerateCwsAssetsParams.parse(args);
          const msg = await generateCwsAssets(params.suite, params.output_dir);
          return { content: [{ type: 'text' as const, text: msg }] };
        }

        case 'seed_test_data': {
          const params = SeedTestDataParams.parse(args);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'requires active browser session', params }) }] };
        }

        default:
          return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'run':
      await cliRun(args);
      break;
    case 'connect':
      await cliConnect(args);
      break;
    case 'capture':
      await cliCapture(args);
      break;
    case 'list':
      console.log(JSON.stringify(listSuites(args[0]), null, 2));
      break;
    case 'byok': {
      const [provider, key] = args;
      if (!provider || !key) {
        console.error('Usage: vision-test-harness byok <anthropic|openai|gemini> <api-key>');
        console.error('\nOr set env vars: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY');
        process.exit(1);
      }
      if (!['anthropic', 'openai', 'gemini'].includes(provider)) {
        console.error('Provider must be: anthropic, openai, or gemini');
        process.exit(1);
      }
      configureByok(provider as 'anthropic' | 'openai' | 'gemini', key);
      console.log(`AI provider set: ${provider}`);
      console.log('AI diagnosis is now enabled. Run vision-test-harness connect to inspect your UI.');
      break;
    }
    case 'byok-clear':
      clearByok();
      console.log('BYOK key cleared.');
      break;
    case 'status': {
      const status = getStatus();
      console.log(JSON.stringify(status, null, 2));
      break;
    }
    case 'badge': {
      const format = args[0] ?? 'markdown';
      const statusArg = (args[1] ?? 'passing') as 'passing' | 'failing' | 'unknown';
      if (format === 'svg') {
        const svg = generateBadgeSvg({ status: statusArg });
        console.log(svg);
      } else if (format === 'markdown') {
        console.log(generateMarkdownBadge());
      } else {
        console.error('Usage: vision-test-harness badge [markdown|svg] [passing|failing|unknown]');
        process.exit(1);
      }
      break;
    }
    case 'init': {
      await cliInit(args);
      break;
    }
    case 'help': {
      console.log(`
Vision Test Harness — Give AI eyes to see and fix your UI.

Commands:
  init [name]                      Create a starter test suite YAML file
  run <suite> [flow]               Run a test suite
  list [directory]                 List available test suites
  connect                          Connect to real Chrome via CDP
  capture <preset>                 Marketing screenshots with privacy overlay
  byok <anthropic|openai|gemini> <key>  Configure AI provider for diagnosis
  byok-clear                       Remove saved AI key
  status                           Show AI provider status
  badge [markdown|svg]             Generate a README badge

Getting started:
  1. vision-test-harness init my-app
  2. Edit test-suites/my-app.yaml with your URL and flows
  3. vision-test-harness run my-app

AI diagnosis (optional):
  Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in your environment.
  Or: vision-test-harness byok anthropic <your-key>
  Then: vision-test-harness connect

https://github.com/upgpt-ai/vision-test-harness
`);
      break;
    }
    case 'serve':
      await startServer();
      break;
    default:
      // No command: if running in a terminal, show getting started.
      // If piped (MCP client), start the server.
      if (process.stdin.isTTY && !command) {
        const suites = listSuites();
        if (suites.length > 0) {
          console.log('Vision Test Harness\n');
          console.log(`Found ${suites.length} test suite${suites.length > 1 ? 's' : ''}:`);
          for (const s of suites) {
            console.log(`  - ${s.name} (${s.type})`);
          }
          console.log(`\nRun a suite: vision-test-harness run ${suites[0].name}`);
          console.log('Run all:     vision-test-harness help');
        } else {
          console.log(`Vision Test Harness — Give AI eyes to see and fix your UI.

Get started in 3 steps:

  1. vision-test-harness init my-app
     Creates test-suites/my-app.yaml with a working example.

  2. Edit test-suites/my-app.yaml
     Set your base_url and customize the test flows.

  3. vision-test-harness run my-app
     Runs tests, captures screenshots, generates an HTML report.

AI diagnosis: set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.
Or: vision-test-harness byok anthropic <your-key>

All commands: vision-test-harness help
Docs: https://github.com/upgpt-ai/vision-test-harness`);
        }
      } else if (command) {
        console.error(`Unknown command: ${command}\nRun: vision-test-harness help`);
        process.exit(1);
      } else {
        await startServer();
      }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
