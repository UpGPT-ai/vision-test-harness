/**
 * Shopify admin adapter — iframe navigation and login helpers.
 */

import type { Page, Frame } from 'playwright';

// ─── Resolve Shopify app iframe ───────────────────────────────────────────────

export async function resolveShopifyAppFrame(
  page: Page,
  appHandle: string,
  timeout = 15_000
): Promise<Frame> {
  // Wait for the app-iframe to appear
  await page.waitForSelector('iframe[name="app-iframe"]', { timeout });

  const iframe = page.frame({ name: 'app-iframe' });
  if (!iframe) {
    throw new Error(`Shopify app iframe not found (handle: ${appHandle})`);
  }

  // Wait for the frame to load
  await iframe.waitForLoadState('load', { timeout });
  return iframe;
}

// ─── Login to Shopify admin ───────────────────────────────────────────────────

export async function loginToShopify(
  page: Page,
  store: string,
  email: string,
  password: string
): Promise<void> {
  const adminUrl = store.startsWith('http') ? store : `https://${store}.myshopify.com/admin`;
  await page.goto(adminUrl, { waitUntil: 'load' });

  // Handle Shopify login flow
  const emailField = page.locator('input[type="email"], input[name="account[email]"]');
  await emailField.waitFor({ timeout: 15_000 });
  await emailField.fill(email);

  const continueBtn = page.locator('button[type="submit"]').first();
  await continueBtn.click();

  // Password step (may be on same page or next)
  try {
    const pwField = page.locator('input[type="password"], input[name="account[password]"]');
    await pwField.waitFor({ timeout: 5_000 });
    await pwField.fill(password);
    await page.locator('button[type="submit"]').last().click();
  } catch { /* might use OAuth/passkeys */ }

  await waitForShopifyAdminChrome(page);
}

// ─── Navigate Shopify admin ───────────────────────────────────────────────────

export async function navigateShopifyAdmin(page: Page, adminPath: string): Promise<void> {
  const current = page.url();
  const baseMatch = current.match(/^(https:\/\/[^/]+\.myshopify\.com\/admin)/);
  if (!baseMatch) {
    throw new Error(`Not on a Shopify admin page: ${current}`);
  }
  const base = baseMatch[1];
  const cleanPath = adminPath.startsWith('/') ? adminPath : `/${adminPath}`;
  await page.goto(`${base}${cleanPath}`, { waitUntil: 'load' });
}

// ─── Wait for Shopify admin chrome to load ────────────────────────────────────

export async function waitForShopifyAdminChrome(page: Page, timeout = 20_000): Promise<void> {
  // Shopify uses Polaris nav — wait for it or the app-iframe
  await Promise.race([
    page.waitForSelector('[data-polaris-unstyled]', { timeout }),
    page.waitForSelector('.Polaris-Frame', { timeout }),
    page.waitForSelector('iframe[name="app-iframe"]', { timeout }),
    page.waitForURL(/\/admin/, { timeout }),
  ]);
}
