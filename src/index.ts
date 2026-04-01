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
import { getStatus, getConfig, login, logout } from './client.js';
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
  console.log(`Report: ${reportPath}`);
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

// ─── Auth gating ─────────────────────────────────────────────────────────────

// Tools that require a free account (login required, any tier)
const AUTH_REQUIRED_TOOLS = new Set([
  'test_run', 'compare_screenshots', 'screenshot',
  'generate_cws_assets', 'seed_test_data', 'inspect_view',
]);

// Tools that require a paid account (Pro or Team)
const PAID_REQUIRED_TOOLS = new Set([
  'inspect_view',
]);

// Tools that work without auth (discovery only)
const PUBLIC_TOOLS = new Set(['list_test_suites']);

function checkAuth(toolName: string): { allowed: boolean; error?: string } {
  if (PUBLIC_TOOLS.has(toolName)) return { allowed: true };

  const config = getConfig();
  if (!config.token) {
    return {
      allowed: false,
      error: [
        `Authentication required to use "${toolName}".`,
        '',
        'Create a free account at https://upgpt.ai/tools/test-harness',
        'Then run: vision-test-harness login <email> <password>',
        '',
        'Free accounts get: test_run, compare_screenshots, seed_test_data, generate_cws_assets',
        'Pro accounts ($29/mo) add: inspect_view (AI-powered visual diagnosis)',
      ].join('\n'),
    };
  }

  if (PAID_REQUIRED_TOOLS.has(toolName)) {
    const tier = config.tier ?? 'free';
    if (tier === 'free') {
      return {
        allowed: false,
        error: [
          `"${toolName}" requires a Pro or Team subscription.`,
          '',
          `You are on the Free tier (${config.email}).`,
          'Upgrade at https://upgpt.ai/tools/test-harness#pricing',
          '',
          'Pro ($29/mo): 500 AI inspections/mo, Claude-powered diagnosis, BYOK support',
          'Team ($99/mo): 2,000 inspections, shared baselines, priority support',
        ].join('\n'),
      };
    }
  }

  return { allowed: true };
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

    // ── Auth gate ──
    const auth = checkAuth(name);
    if (!auth.allowed) {
      return {
        content: [{ type: 'text' as const, text: auth.error! }],
        isError: true,
      };
    }

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
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ...result, report_path: reportPath }, null, 2) }] };
        }

        case 'inspect_view': {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'inspect_view requires an active browser session. Use CLI: vision-test-harness connect' }) }] };
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
    case 'login': {
      const [email, password] = args;
      if (!email || !password) { console.error('Usage: vision-test-harness login <email> <password>'); process.exit(1); }
      const config = await login(email, password);
      console.log(`Logged in as ${config.email} (${config.tier})`);
      break;
    }
    case 'logout':
      logout();
      console.log('Logged out.');
      break;
    case 'status': {
      const status = getStatus();
      console.log(JSON.stringify(status, null, 2));
      break;
    }
    default:
      // No command or 'serve' — start MCP server
      await startServer();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
