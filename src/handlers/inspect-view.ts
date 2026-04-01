/**
 * Vision-aware inspection handler.
 * Returns screenshot, console logs, SW logs, network errors, source code, view skills.
 */

import type { Page } from 'playwright';
import type { ConsoleEntry, NetworkError, BrowserSession } from '../browser/launcher.js';
import type { ViewSkill } from '../schema.js';
import { callPremiumApi } from '../client.js';
import fs from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InspectOptions {
  selector?: string;
  sourceFile?: string;
  isPremium?: boolean;
}

export interface InspectResult {
  screenshot_base64: string;
  console_logs: ConsoleEntry[];
  sw_logs: ConsoleEntry[];
  network_errors: NetworkError[];
  source_code?: string;
  view_skills?: ViewSkill[];
  ai_diagnosis?: string;
  upgrade_prompt?: string;
}

// ─── Path traversal guard ─────────────────────────────────────────────────────

function safeReadFile(filePath: string, rootDir: string): string | null {
  const resolved = path.resolve(filePath);
  const root = path.resolve(rootDir);
  if (!resolved.startsWith(root)) {
    return null; // Path traversal attempt
  }
  try {
    return fs.readFileSync(resolved, 'utf8');
  } catch {
    return null;
  }
}

// ─── Inspect view ─────────────────────────────────────────────────────────────

export async function inspectView(
  page: Page,
  session: BrowserSession,
  viewSkills: ViewSkill[] = [],
  options: InspectOptions = {}
): Promise<InspectResult> {
  // Take screenshot
  let screenshotBuffer: Buffer;
  if (options.selector) {
    const el = page.locator(options.selector).first();
    screenshotBuffer = await el.screenshot().catch(() => page.screenshot());
  } else {
    screenshotBuffer = await page.screenshot();
  }
  const screenshot_base64 = screenshotBuffer.toString('base64');

  // Read source code if requested
  let source_code: string | undefined;
  if (options.sourceFile) {
    const cwd = process.cwd();
    source_code = safeReadFile(options.sourceFile, cwd) ?? undefined;
  }

  const result: InspectResult = {
    screenshot_base64,
    console_logs: [...session.consoleLogs],
    sw_logs: [...session.swConsoleLogs],
    network_errors: [...session.networkErrors],
    source_code,
    view_skills: viewSkills.length > 0 ? viewSkills : undefined,
  };

  if (options.isPremium) {
    // Premium: AI diagnosis
    try {
      const diagnosis = await callPremiumApi('inspect', {
        screenshot_base64,
        console_errors: session.consoleLogs.filter((l) => l.level === 'error'),
        network_errors: session.networkErrors,
        view_skills: viewSkills,
      });
      result.ai_diagnosis = String(diagnosis);
    } catch (err) {
      result.ai_diagnosis = `AI diagnosis unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    result.upgrade_prompt =
      'AI-powered diagnosis available with Vision Test Harness Pro ($29/mo). ' +
      'Run `vision-test-harness login` to activate. https://upgpt.ai/tools/test-harness';
  }

  return result;
}
