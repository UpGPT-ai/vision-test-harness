/**
 * WordPress-specific Playwright step handlers.
 */

import type { Page } from 'playwright';

// ─── wp_login ─────────────────────────────────────────────────────────────────

export async function wpLogin(
  page: Page,
  url?: string,
  username = 'admin',
  password = 'admin'
): Promise<void> {
  const loginUrl = url ?? (page.url().replace(/\/wp-admin.*/, '') + '/wp-login.php');
  await page.goto(loginUrl, { waitUntil: 'load' });

  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  await page.locator('#wp-submit').click();

  // Wait for dashboard or admin bar
  await Promise.race([
    page.waitForSelector('#wpadminbar', { timeout: 15_000 }),
    page.waitForSelector('.wp-admin', { timeout: 15_000 }),
  ]);
}

// ─── wp_activate_plugin ───────────────────────────────────────────────────────

export async function wpActivatePlugin(page: Page, pluginSlug: string): Promise<void> {
  const base = page.url().replace(/\/wp-admin.*/, '');
  await page.goto(`${base}/wp-admin/plugins.php`, { waitUntil: 'load' });

  // Find the activate link for the plugin
  const activateLink = page.locator(`#${pluginSlug} .activate a, tr[data-slug="${pluginSlug}"] .activate a`);

  const isVisible = await activateLink.isVisible().catch(() => false);
  if (!isVisible) {
    // Plugin may already be active
    const activeRow = page.locator(`#${pluginSlug}.active, tr[data-slug="${pluginSlug}"].active`);
    if (await activeRow.isVisible().catch(() => false)) {
      return; // Already active
    }
    throw new Error(`Plugin "${pluginSlug}" not found or cannot be activated`);
  }

  await activateLink.click();
  await page.waitForSelector('.notice-success, #message.updated', { timeout: 10_000 });
}

// ─── wp_navigate_admin ────────────────────────────────────────────────────────

export async function wpNavigateAdmin(page: Page, adminPath: string): Promise<void> {
  const base = page.url().replace(/\/wp-admin.*/, '');
  const cleanPath = adminPath.startsWith('/') ? adminPath.slice(1) : adminPath;
  await page.goto(`${base}/wp-admin/${cleanPath}`, { waitUntil: 'load' });
}

// ─── wp_assert_notice ─────────────────────────────────────────────────────────

export async function wpAssertNotice(
  page: Page,
  text: string,
  type?: 'success' | 'error' | 'warning' | 'info'
): Promise<void> {
  const typeSelector = type ? `.notice-${type}` : '.notice';
  const selector = `${typeSelector}, #message.updated, #message.error, .wp-die-message`;

  const noticeEl = page.locator(selector).first();
  await noticeEl.waitFor({ timeout: 10_000 });

  const noticeText = await noticeEl.textContent() ?? '';
  if (!noticeText.includes(text)) {
    throw new Error(`Expected notice to contain "${text}", got: "${noticeText.trim()}"`);
  }
}
