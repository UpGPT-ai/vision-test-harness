/**
 * Browser launcher — Playwright + Chrome extension automation.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConsoleEntry {
  timestamp: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  source: 'page' | 'worker' | 'serviceworker';
}

export interface NetworkError {
  timestamp: number;
  url: string;
  method: string;
  error: string;
}

export interface BrowserSession {
  context: BrowserContext;
  extensionId: string;
  extensionPath: string;
  consoleLogs: ConsoleEntry[];
  swConsoleLogs: ConsoleEntry[];
  networkErrors: NetworkError[];
  /** Base URL for sidebar when served via localhost (connect/run mode) */
  sidebarUrl?: string;
  close(): Promise<void>;
}

// ─── Chrome executable detection ─────────────────────────────────────────────

function findChrome(): string | undefined {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

// ─── Extension ID detection ───────────────────────────────────────────────────

async function detectExtensionId(
  context: BrowserContext,
  extPath: string,
  timeout = 30_000
): Promise<string> {
  // Strategy 1: Watch service worker URLs
  const swUrlPromise = new Promise<string>((resolve) => {
    context.on('serviceworker', (worker) => {
      const url = worker.url();
      const match = url.match(/chrome-extension:\/\/([a-z]{32})\//);
      if (match) resolve(match[1]);
    });
  });

  // Strategy 2: Parse Chrome Preferences file
  const prefsPath = path.join(extPath, '..', '..', 'Preferences');
  if (fs.existsSync(prefsPath)) {
    try {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      const extensions = prefs?.extensions?.settings ?? {};
      for (const [id, ext] of Object.entries(extensions)) {
        const e = ext as Record<string, unknown>;
        if (e.path === extPath || (e.path as string)?.includes(path.basename(extPath))) {
          return id;
        }
      }
    } catch { /* ignore */ }
  }

  // Strategy 3: chrome://extensions DOM scrape
  const scrapeId = async (): Promise<string | null> => {
    const page = await context.newPage();
    try {
      await page.goto('chrome://extensions', { timeout: 10_000 });
      await page.waitForTimeout(2000);
      const id = await page.evaluate(() => {
        const mgr = document.querySelector('extensions-manager');
        const root = mgr?.shadowRoot?.querySelector('extensions-item-list');
        const items = root?.shadowRoot?.querySelectorAll('extensions-item') ?? [];
        for (const item of items) {
          const idEl = item.shadowRoot?.querySelector('#extension-id');
          if (idEl?.textContent) return idEl.textContent.replace('ID: ', '').trim();
        }
        return null;
      });
      return id;
    } catch {
      return null;
    } finally {
      await page.close();
    }
  };

  // Run strategies concurrently with timeout
  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('Extension ID detection timed out')), timeout)
  );

  // Try SW URL first (fast), then DOM scrape
  const scraped = await Promise.race([
    swUrlPromise,
    scrapeId().then((id) => {
      if (id) return id;
      return new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('No ID from scrape')), 5000)
      );
    }),
    timeoutPromise,
  ]);

  return scraped;
}

// ─── Verify extension ID ──────────────────────────────────────────────────────

async function verifyExtensionId(context: BrowserContext, id: string): Promise<boolean> {
  const page = await context.newPage();
  try {
    const resp = await page.goto(`chrome-extension://${id}/sidebar/index.html`, { timeout: 5000 });
    return resp?.status() !== 404;
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

// ─── Load extension via chrome://extensions UI ──────────────────────────────

async function loadExtensionViaUI(
  context: BrowserContext,
  absExtPath: string
): Promise<string> {
  const page = await context.newPage();
  await page.goto('chrome://extensions', { timeout: 15_000 });
  await page.waitForTimeout(1500);

  // Step 1: Enable Developer Mode toggle (top-right)
  // The toggle is inside the extensions-manager shadow DOM
  const devModeEnabled = await page.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    const toolbar = mgr?.shadowRoot?.querySelector('extensions-toolbar');
    const toggle = toolbar?.shadowRoot?.querySelector('#devMode') as HTMLInputElement | null;
    if (!toggle) return null;
    if (!toggle.checked) {
      toggle.click();
      return 'toggled';
    }
    return 'already-on';
  });
  console.error(`[TestHarness] Developer mode: ${devModeEnabled}`);
  await page.waitForTimeout(1000);

  // Step 2: Load the extension using chrome.developerPrivate.loadUnpacked.
  // Playwright's page.evaluate runs in a utility world where chrome.developerPrivate
  // is not available. We must use CDP Runtime.evaluate to run in the MAIN world.
  const cdpSession = await page.context().newCDPSession(page);
  const loadResult = await cdpSession.send('Runtime.evaluate', {
    expression: `
      new Promise((resolve, reject) => {
        if (!chrome?.developerPrivate?.loadUnpacked) {
          reject(new Error('chrome.developerPrivate.loadUnpacked not available'));
          return;
        }
        chrome.developerPrivate.loadUnpacked(
          { path: ${JSON.stringify(absExtPath)}, failQuietly: true },
          (result) => {
            if (chrome.runtime?.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result || 'loaded');
            }
          }
        );
      })
    `,
    awaitPromise: true,
    returnByValue: true,
  }).catch((e: Error) => ({ result: { value: null }, error: e.message }));

  console.error(`[TestHarness] Extension loaded via developerPrivate API: ${absExtPath}`);
  await cdpSession.detach();

  // Wait for the extension to register — reload the extensions page to see it
  await page.reload({ timeout: 10_000 });
  await page.waitForTimeout(3000);

  // Step 4: Scrape the extension ID from the page
  const extensionId = await page.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    const list = mgr?.shadowRoot?.querySelector('extensions-item-list');
    const items = list?.shadowRoot?.querySelectorAll('extensions-item') ?? [];
    for (const item of items) {
      const idEl = item.shadowRoot?.querySelector('#extension-id');
      if (idEl?.textContent) {
        return idEl.textContent.replace('ID: ', '').trim();
      }
    }
    return null;
  });

  await page.close();

  if (!extensionId) {
    throw new Error('Failed to detect extension ID after loading via chrome://extensions');
  }

  console.error(`[TestHarness] Extension ID: ${extensionId}`);
  return extensionId;
}

// ─── Launch browser ───────────────────────────────────────────────────────────

/**
 * Launch browser for extension testing.
 *
 * Chrome 146+ silently ignores --load-extension in automated contexts.
 * Instead, we serve the sidebar HTML/JS/CSS via a localhost HTTP server
 * and navigate a plain Chromium page to it. The Preact sidebar renders
 * identically — it just can't call chrome.* APIs (which we mock via
 * IndexedDB seeding). This is the same approach as `connect` mode.
 *
 * For tests that need real chrome.* APIs, use `connect` mode with
 * a manually-launched Chrome instance.
 */
export async function launchBrowser(extensionPath: string): Promise<BrowserSession> {
  const absExtPath = path.resolve(extensionPath);
  const consoleLogs: ConsoleEntry[] = [];
  const swConsoleLogs: ConsoleEntry[] = [];
  const networkErrors: NetworkError[] = [];

  // Start localhost HTTP server serving the extension's sidebar files
  const { startSidebarServer } = await import('./chrome-connect.js');
  const sidebarServer = await startSidebarServer(absExtPath);
  const sidebarUrl = `http://127.0.0.1:${sidebarServer.port}`;
  console.error(`[TestHarness] Sidebar server: ${sidebarUrl}`);

  // Launch headless Chromium (no extension needed — sidebar served via HTTP)
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 400, height: 600 },
  });

  // Capture console logs
  context.on('page', (page: Page) => {
    page.on('console', (msg) => {
      consoleLogs.push({
        timestamp: Date.now(),
        level: msg.type() as ConsoleEntry['level'],
        text: msg.text(),
        source: 'page',
      });
    });
    page.on('requestfailed', (req) => {
      networkErrors.push({
        timestamp: Date.now(),
        url: req.url(),
        method: req.method(),
        error: req.failure()?.errorText ?? 'Unknown',
      });
    });
  });

  return {
    context,
    extensionId: 'localhost',
    extensionPath: absExtPath,
    consoleLogs,
    swConsoleLogs,
    networkErrors,
    sidebarUrl,
    close: async () => {
      await context.close();
      await browser.close();
      sidebarServer.close();
    },
  };
}

// ─── Open side panel ──────────────────────────────────────────────────────────

export async function openSidePanel(session: BrowserSession): Promise<Page> {
  const { context, extensionId } = session;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidebar/index.html`, {
    waitUntil: 'load',
    timeout: 30_000,
  });

  // Attach console listener
  page.on('console', (msg) => {
    session.consoleLogs.push({
      timestamp: Date.now(),
      level: msg.type() as ConsoleEntry['level'],
      text: msg.text(),
      source: 'page',
    });
  });

  // Attach network error listener
  page.on('requestfailed', (req) => {
    session.networkErrors.push({
      timestamp: Date.now(),
      url: req.url(),
      method: req.method(),
      error: req.failure()?.errorText ?? 'Unknown',
    });
  });

  return page;
}

// ─── Seed chrome.storage ──────────────────────────────────────────────────────

export async function seedChromeStorage(
  context: BrowserContext,
  extensionId: string,
  data: Record<string, unknown>
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidebar/index.html`, { timeout: 10_000 });
  await page.evaluate((d) => {
    return new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).chrome.storage.local.set(d, resolve);
    });
  }, data as Record<string, unknown>);
  await page.close();
}

// ─── Seed IndexedDB ───────────────────────────────────────────────────────────

export async function seedIndexedDB(
  page: Page,
  dbName: string,
  storeName: string,
  records: unknown[]
): Promise<void> {
  await page.evaluate(({ dbName, storeName, records }) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const record of records) store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, { dbName, storeName, records });
}
