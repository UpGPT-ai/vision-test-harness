/**
 * MCP tool definitions — 7 tools for Vision Test Harness.
 */

import { z } from 'zod';

// ─── Tool parameter schemas ───────────────────────────────────────────────────

export const ListTestSuitesParams = z.object({
  directory: z.string().optional().describe('Directory to search for test suites (default: ./test-suites)'),
});

export const TestRunParams = z.object({
  suite: z.string().describe('Name of the test suite to run'),
  flow: z.string().optional().describe('Name of a specific flow to run (runs all if omitted)'),
  headless: z.boolean().optional().describe('Run browser in headless mode (default: false)'),
  update_baselines: z.boolean().optional().describe('Update screenshot baselines instead of comparing'),
});

export const InspectViewParams = z.object({
  screenshot_path: z.string().optional().describe('Path to a saved screenshot PNG to analyze (use this in MCP mode after test_run)'),
  console_errors: z.array(z.string()).optional().describe('Console error strings to include in AI diagnosis context'),
  source_file: z.string().optional().describe('Source file path to include in inspection'),
  selector: z.string().optional().describe('CSS selector to inspect in connect mode (inspects full page if omitted)'),
});

export const ScreenshotParams = z.object({
  name: z.string().describe('Name for the screenshot file'),
  selector: z.string().optional().describe('CSS selector to screenshot (full page if omitted)'),
  full_page: z.boolean().optional().describe('Capture full scrollable page'),
});

export const CompareScreenshotsParams = z.object({
  baseline: z.string().describe('Path to baseline PNG'),
  current: z.string().describe('Path to current PNG'),
  threshold: z.number().optional().describe('Max allowed diff percentage (default: 5)'),
  output: z.string().optional().describe('Path to write diff image'),
});

export const GenerateCwsAssetsParams = z.object({
  suite: z.string().describe('Test suite name to generate assets for'),
  output_dir: z.string().optional().describe('Directory to write marketing assets (default: __marketing__)'),
});

export const SeedTestDataParams = z.object({
  chrome_storage: z.record(z.unknown()).optional().describe('Data to seed into chrome.storage.local'),
  local_storage: z.record(z.string()).optional().describe('Data to seed into localStorage'),
  indexed_db: z.array(z.object({
    db: z.string(),
    store: z.string(),
    records: z.array(z.unknown()),
  })).optional().describe('IndexedDB records to seed'),
});

// ─── Tool descriptors (for MCP registration) ──────────────────────────────────

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: z.ZodType;
}

export const TOOLS: ToolDescriptor[] = [
  {
    name: 'list_test_suites',
    description: 'List available test suites from the test-suites directory. Returns suite names and descriptions.',
    inputSchema: ListTestSuitesParams,
  },
  {
    name: 'test_run',
    description: 'Run a test suite or specific flow. Launches browser, executes steps, captures screenshots, returns pass/fail results.',
    inputSchema: TestRunParams,
  },
  {
    name: 'inspect_view',
    description: 'AI-powered inspection of a screenshot. Pass screenshot_path from a test_run result to get AI diagnosis of what broke and how to fix it. Requires ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY. In connect mode (CLI), inspects the live browser page.',
    inputSchema: InspectViewParams,
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page or a specific element.',
    inputSchema: ScreenshotParams,
  },
  {
    name: 'compare_screenshots',
    description: 'Compare two screenshots using pixelmatch. Returns diff percentage and path to diff image.',
    inputSchema: CompareScreenshotsParams,
  },
  {
    name: 'generate_cws_assets',
    description: 'Generate Chrome Web Store listing screenshots from captured test screenshots.',
    inputSchema: GenerateCwsAssetsParams,
  },
  {
    name: 'seed_test_data',
    description: 'Seed test data into chrome.storage, localStorage, and IndexedDB for the current browser session.',
    inputSchema: SeedTestDataParams,
  },
];

export type TestRunInput = z.infer<typeof TestRunParams>;
export type InspectViewInput = z.infer<typeof InspectViewParams>;
export type ScreenshotInput = z.infer<typeof ScreenshotParams>;
export type CompareScreenshotsInput = z.infer<typeof CompareScreenshotsParams>;
export type GenerateCwsAssetsInput = z.infer<typeof GenerateCwsAssetsParams>;
export type SeedTestDataInput = z.infer<typeof SeedTestDataParams>;
export type ListTestSuitesInput = z.infer<typeof ListTestSuitesParams>;
