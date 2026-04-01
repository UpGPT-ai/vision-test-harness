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
  selector: z.string().optional().describe('CSS selector to inspect (inspects full page if omitted)'),
  source_file: z.string().optional().describe('Source file path to include in inspection'),
  include_source: z.boolean().optional().describe('Include source code in result'),
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
    description: 'Vision-aware inspection of the current page. Returns screenshot, console logs, service worker logs, network errors, source code, and view skills. Free tier: screenshots + upgrade prompt. Paid tier: AI diagnosis.',
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
