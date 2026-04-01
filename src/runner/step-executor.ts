/**
 * Step executor — dispatches all test step types.
 */

import type { Page } from 'playwright';
import type { Step } from '../schema.js';
import type { WordPressClient } from '../browser/wordpress-adapter.js';
import type { ViewSkill } from '../schema.js';
import { compareImages } from '../screenshot/diff.js';
import { applyPrivacyOverlay } from '../browser/privacy-overlay.js';
import { wpLogin, wpActivatePlugin, wpNavigateAdmin, wpAssertNotice } from './wordpress-steps.js';
import path from 'path';
import fs from 'fs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepContext {
  page: Page;
  screenshotDir: string;
  baselineDir: string;
  updateBaselines: boolean;
  wpClient?: WordPressClient;
  viewSkills?: ViewSkill[];
  /** Base URL for sidebar server (localhost mode) — navigate URLs resolved against this */
  sidebarBaseUrl?: string;
}

export interface StepResult {
  action: string;
  status: 'pass' | 'fail' | 'skip';
  duration_ms: number;
  error?: string;
  screenshot_path?: string;
  diff_percent?: number;
}

// ─── Security scan for evaluate steps ────────────────────────────────────────

const SUSPICIOUS_PATTERNS = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /chrome\.storage\.local\.clear\s*\(/,
  /document\.cookie\s*=/,
  /window\.open\s*\(/,
  /\beval\s*\(/,
];

function scanScript(script: string): string | null {
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(script)) {
      return `Suspicious pattern detected: ${pattern.source}`;
    }
  }
  return null;
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function executeStep(step: Step, ctx: StepContext): Promise<StepResult> {
  const start = Date.now();
  const { page, screenshotDir, baselineDir, updateBaselines } = ctx;

  const result = (status: StepResult['status'], extra: Partial<StepResult> = {}): StepResult => ({
    action: step.action,
    status,
    duration_ms: Date.now() - start,
    ...extra,
  });

  try {
    switch (step.action) {
      case 'navigate': {
        let url = step.url;
        // Resolve relative paths (e.g., "sidebar/index.html") against sidebarBaseUrl
        if (ctx.sidebarBaseUrl && !url.startsWith('http') && !url.startsWith('chrome')) {
          url = `${ctx.sidebarBaseUrl}/${url}`;
        }
        await page.goto(url, { waitUntil: 'load' });
        return result('pass');
      }

      case 'click': {
        await page.locator(step.selector).click({ timeout: step.timeout ?? 10_000 });
        return result('pass');
      }

      case 'type': {
        await page.locator(step.selector).fill(step.text);
        return result('pass');
      }

      case 'wait': {
        if (step.selector) {
          await page.waitForSelector(step.selector, { timeout: step.timeout ?? 10_000 });
        } else {
          await page.waitForTimeout(step.ms ?? 1000);
        }
        return result('pass');
      }

      case 'assert_text': {
        const el = page.locator(step.selector).first();
        await el.waitFor({ timeout: 10_000 });
        const text = await el.textContent() ?? '';
        const matches = step.contains ? text.includes(step.text) : text.trim() === step.text;
        if (!matches) {
          return result('fail', { error: `Expected "${step.text}", got "${text.trim()}"` });
        }
        return result('pass');
      }

      case 'assert_element': {
        const el = page.locator(step.selector).first();
        if (step.exists === false) {
          const count = await el.count();
          if (count > 0) return result('fail', { error: `Element "${step.selector}" exists but should not` });
        } else if (step.visible === false) {
          const visible = await el.isVisible().catch(() => false);
          if (visible) return result('fail', { error: `Element "${step.selector}" is visible but should not be` });
        } else {
          await el.waitFor({ timeout: 10_000 });
          if (step.visible) {
            const visible = await el.isVisible();
            if (!visible) return result('fail', { error: `Element "${step.selector}" not visible` });
          }
        }
        return result('pass');
      }

      case 'screenshot': {
        fs.mkdirSync(screenshotDir, { recursive: true });
        const screenshotPath = path.join(screenshotDir, `${step.name}.png`);
        await page.screenshot({
          path: screenshotPath,
          fullPage: step.fullPage ?? false,
          clip: step.clip,
        });
        return result('pass', { screenshot_path: screenshotPath });
      }

      case 'compare': {
        fs.mkdirSync(screenshotDir, { recursive: true });
        fs.mkdirSync(baselineDir, { recursive: true });
        const currentPath = path.join(screenshotDir, `${step.name}.png`);
        const baselinePath = path.join(baselineDir, `${step.name}.png`);

        await page.screenshot({ path: currentPath, fullPage: step.fullPage ?? false });

        if (updateBaselines || !fs.existsSync(baselinePath)) {
          fs.copyFileSync(currentPath, baselinePath);
          return result('pass', { screenshot_path: currentPath, diff_percent: 0 });
        }

        const diffPath = path.join(screenshotDir, `${step.name}.diff.png`);
        const diff = await compareImages(baselinePath, currentPath, diffPath, 0.1);
        const threshold = step.threshold ?? 5;

        if (diff.diffPercent > threshold) {
          return result('fail', {
            error: `Visual diff ${diff.diffPercent.toFixed(2)}% exceeds threshold ${threshold}%`,
            screenshot_path: currentPath,
            diff_percent: diff.diffPercent,
          });
        }
        return result('pass', { screenshot_path: currentPath, diff_percent: diff.diffPercent });
      }

      case 'open_side_panel': {
        // Navigation to extension side panel should already be handled by suite runner
        await page.waitForLoadState('load', { timeout: step.timeout ?? 30_000 });
        return result('pass');
      }

      case 'wait_for_content_script': {
        const sel = step.selector ?? '[data-upinbox-injected], [data-vision-injected]';
        await page.waitForSelector(sel, { timeout: step.timeout ?? 15_000 });
        return result('pass');
      }

      case 'evaluate': {
        const warning = scanScript(step.script);
        if (warning) {
          return result('fail', { error: `Security scan: ${warning}` });
        }
        // Wait for page to be stable (no pending navigations)
        await page.waitForLoadState('load').catch(() => {});
        // Wrap in async IIFE to support top-level await in evaluate scripts
        // Retry once on context destruction (common with SPA routers)
        const wrappedScript = `(async () => { ${step.script} })()`;
        let evalResult: unknown;
        try {
          evalResult = await page.evaluate(wrappedScript);
        } catch (retryErr) {
          if (String(retryErr).includes('context was destroyed')) {
            await page.waitForLoadState('load').catch(() => {});
            await new Promise(r => setTimeout(r, 1000));
            evalResult = await page.evaluate(wrappedScript);
          } else {
            throw retryErr;
          }
        }
        if (step.expect !== undefined) {
          const match = JSON.stringify(evalResult) === JSON.stringify(step.expect);
          if (!match) {
            return result('fail', { error: `Expected ${JSON.stringify(step.expect)}, got ${JSON.stringify(evalResult)}` });
          }
        }
        return result('pass');
      }

      case 'wp_login': {
        await wpLogin(page, step.url, step.username, step.password);
        return result('pass');
      }

      case 'wp_activate_plugin': {
        await wpActivatePlugin(page, step.plugin_slug);
        return result('pass');
      }

      case 'wp_navigate_admin': {
        await wpNavigateAdmin(page, step.path);
        return result('pass');
      }

      case 'wp_assert_notice': {
        await wpAssertNotice(page, step.text, step.type);
        return result('pass');
      }

      case 'privacy_overlay': {
        await applyPrivacyOverlay(page, {
          preset: step.preset,
          demo_data: step.demo_data,
          rules: step.rules,
          hide_profile: step.hide_profile,
        });
        return result('pass');
      }

      default: {
        return result('skip', { error: `Unknown step action: ${(step as { action: string }).action}` });
      }
    }
  } catch (err) {
    return result('fail', { error: err instanceof Error ? err.message : String(err) });
  }
}
