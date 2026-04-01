/**
 * Suite runner — orchestrates browser launch, seed, and flow execution.
 */

import type { TestSuite, Flow } from '../schema.js';
import type { StepResult } from './step-executor.js';
import { launchBrowser, openSidePanel, seedChromeStorage, seedIndexedDB } from '../browser/launcher.js';
import { createWordPressClient } from '../browser/wordpress-adapter.js';
import { executeStep } from './step-executor.js';
import path from 'path';
import fs from 'fs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlowResult {
  flow: string;
  status: 'pass' | 'fail';
  steps: StepResult[];
  duration_ms: number;
  error?: string;
}

export interface SuiteResult {
  suite: string;
  status: 'pass' | 'fail';
  flows: FlowResult[];
  duration_ms: number;
}

// ─── Run a single flow ────────────────────────────────────────────────────────

async function runFlow(
  flow: Flow,
  suite: TestSuite,
  screenshotDir: string,
  baselineDir: string,
  updateBaselines: boolean
): Promise<FlowResult> {
  const start = Date.now();
  const steps: StepResult[] = [];

  // Determine browser/page target based on suite type
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  let page: import('playwright').Page | null = null;
  const wpClient = suite.wp_mcp_endpoint
    ? createWordPressClient(suite.wp_mcp_endpoint, suite.wp_mcp_key ?? '')
    : undefined;

  // Track sidebar base URL for resolving relative navigate steps
  let sidebarBaseUrl: string | undefined;

  try {
    if (suite.type === 'chrome-extension' && suite.extension_path) {
      browser = await launchBrowser(suite.extension_path);
      page = await browser.context.newPage();
      sidebarBaseUrl = browser.sidebarUrl;

      // In localhost mode, inject a chrome.storage polyfill so the extension app
      // can read seeded data without real Chrome extension APIs.
      if (browser.extensionId === 'localhost' && suite.seed_data) {
        const syncData = suite.seed_data.chrome_storage_sync ?? suite.seed_data.chrome_storage ?? {};
        const localData = suite.seed_data.chrome_storage_local ?? {};
        await page.addInitScript(({ sync, local }) => {
          // Polyfill chrome.storage for localhost testing
          const store: Record<string, Record<string, unknown>> = {
            sync: { ...sync },
            local: { ...local },
          };
          const listeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];
          const makeArea = (area: string) => ({
            get: (keys: string | string[] | null | Record<string, unknown>, cb?: Function) => {
              const result: Record<string, unknown> = {};
              if (keys === null || keys === undefined) {
                Object.assign(result, store[area]);
              } else if (typeof keys === 'string') {
                if (keys in store[area]) result[keys] = store[area][keys];
              } else if (Array.isArray(keys)) {
                for (const k of keys) { if (k in store[area]) result[k] = store[area][k]; }
              } else {
                for (const [k, def] of Object.entries(keys)) {
                  result[k] = k in store[area] ? store[area][k] : def;
                }
              }
              if (cb) cb(result);
              return Promise.resolve(result);
            },
            set: (items: Record<string, unknown>, cb?: Function) => {
              Object.assign(store[area], items);
              if (cb) cb();
              return Promise.resolve();
            },
            remove: (keys: string | string[], cb?: Function) => {
              const ks = typeof keys === 'string' ? [keys] : keys;
              for (const k of ks) delete store[area][k];
              if (cb) cb();
              return Promise.resolve();
            },
            clear: (cb?: Function) => { store[area] = {}; if (cb) cb(); return Promise.resolve(); },
          });
          (window as any).chrome = {
            ...(window as any).chrome,
            storage: {
              sync: makeArea('sync'),
              local: makeArea('local'),
              onChanged: {
                addListener: (fn: any) => listeners.push(fn),
                removeListener: (fn: any) => {
                  const i = listeners.indexOf(fn);
                  if (i >= 0) listeners.splice(i, 1);
                },
              },
            },
            runtime: {
              ...(window as any).chrome?.runtime,
              id: 'test-harness-localhost',
              getURL: (path: string) => path,
              sendMessage: (...args: unknown[]) => {
                const cb = args[args.length - 1];
                if (typeof cb === 'function') cb(undefined);
                return Promise.resolve(undefined);
              },
              onMessage: { addListener: () => {}, removeListener: () => {} },
            },
            i18n: {
              getMessage: (key: string) => key,
            },
          };
        }, { sync: syncData, local: localData });

        // Pre-seed IndexedDB settings AND classifications via addInitScript.
        // This runs BEFORE the app code, so data is available when the app initializes.
        const syncUser = (syncData as Record<string, Record<string, unknown>>).upinbox_user ?? {};
        const idbSeed = {
          settings: {
            onboarding_complete: (localData as Record<string, unknown>).onboarding_complete ?? true,
            user_tier: syncUser.tier ?? (localData as Record<string, unknown>).user_tier ?? 'free',
            scan_count: (localData as Record<string, unknown>).scan_count ?? 0,
            last_known_tier: (localData as Record<string, unknown>).last_known_tier ?? 'free',
            total_classified: (localData as Record<string, unknown>).total_classified ?? 0,
          },
          classifications: suite.seed_data?.indexed_db?.find((db: { db: string }) => db.db === 'upinbox')?.records ?? [],
        };
        await page.addInitScript((seed) => {
          const openReq = indexedDB.open('upinbox');
          openReq.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('classifications')) db.createObjectStore('classifications', { keyPath: 'id' });
          };
          openReq.onsuccess = (e: any) => {
            try {
              const db = e.target.result;
              // Seed settings
              const stx = db.transaction('settings', 'readwrite');
              const sStore = stx.objectStore('settings');
              for (const [key, value] of Object.entries(seed.settings)) {
                sStore.put({ key, value });
              }
              // Seed classifications if provided
              if (seed.classifications.length > 0) {
                const ctx = db.transaction('classifications', 'readwrite');
                const cStore = ctx.objectStore('classifications');
                for (const record of seed.classifications) {
                  cStore.put(record);
                }
              }
            } catch { /* IDB may not have the stores yet */ }
          };
        }, idbSeed);
      } else if (suite.seed_data?.chrome_storage) {
        await seedChromeStorage(browser.context, browser.extensionId, suite.seed_data.chrome_storage);
      }
    } else {
      // Web app / WordPress / Shopify — use a plain browser context
      const { chromium } = await import('playwright');
      const ctx = await chromium.launch({ headless: true }).then((b) =>
        b.newContext().then(async (c) => ({ context: c, browser: b }))
      );
      page = await ctx.context.newPage();
      browser = null as unknown as typeof browser;
    }

    // Null-guard
    if (!page) throw new Error('No page available');

    // Seed localStorage on page
    if (suite.seed_data?.local_storage) {
      await page.addInitScript((storage) => {
        for (const [k, v] of Object.entries(storage)) {
          localStorage.setItem(k, v);
        }
      }, suite.seed_data.local_storage);
    }

    // Run steps
    for (const step of flow.steps) {
      if (!page) break;
      const result = await executeStep(step, {
        page,
        screenshotDir,
        baselineDir,
        updateBaselines,
        wpClient,
        viewSkills: suite.view_skills,
        sidebarBaseUrl,
      });
      steps.push(result);

      if (result.status === 'fail') {
        return {
          flow: flow.name,
          status: 'fail',
          steps,
          duration_ms: Date.now() - start,
          error: result.error,
        };
      }
    }

    return {
      flow: flow.name,
      status: 'pass',
      steps,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      flow: flow.name,
      status: 'fail',
      steps,
      duration_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── Run suite ────────────────────────────────────────────────────────────────

export async function runSuite(
  suite: TestSuite,
  options: {
    flowFilter?: string;
    updateBaselines?: boolean;
    reportDir?: string;
  } = {}
): Promise<SuiteResult> {
  const start = Date.now();
  const reportDir = options.reportDir ?? path.join(process.cwd(), '__reports__', suite.name);
  const screenshotDir = path.join(reportDir, 'screenshots');
  const baselineDir = path.join(reportDir, 'baselines');
  const updateBaselines = options.updateBaselines ?? false;

  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(baselineDir, { recursive: true });

  const flows = options.flowFilter
    ? suite.flows.filter((f) => f.name === options.flowFilter)
    : suite.flows;

  const SUITE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  const runAll = async (): Promise<FlowResult[]> => {
    const results: FlowResult[] = [];
    for (const flow of flows) {
      const result = await runFlow(flow, suite, screenshotDir, baselineDir, updateBaselines);
      results.push(result);
    }
    return results;
  };

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Suite timed out after 5 minutes')), SUITE_TIMEOUT)
  );

  try {
    const flowResults = await Promise.race([runAll(), timeoutPromise]);
    const overallStatus = flowResults.every((f) => f.status === 'pass') ? 'pass' : 'fail';

    return {
      suite: suite.name,
      status: overallStatus,
      flows: flowResults,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      suite: suite.name,
      status: 'fail',
      flows: [],
      duration_ms: Date.now() - start,
    };
  }
}
