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

// ─── Step result helper ──────────────────────────────────────────────────────

export interface WpStepResult {
  status: 'pass' | 'fail';
  error?: string;
}

function pass(): WpStepResult {
  return { status: 'pass' };
}

function fail(error: string): WpStepResult {
  return { status: 'fail', error };
}

// ─── Helper: dismiss any blocking notices/spinners ───────────────────────────

async function dismissNotices(page: Page): Promise<void> {
  // Close any dismissible admin notices
  const dismissButtons = page.locator('.notice-dismiss');
  const count = await dismissButtons.count();
  for (let i = 0; i < count; i++) {
    await dismissButtons.nth(i).click().catch(() => {});
  }
  // Wait for any spinners to clear
  await page.locator('.spinner.is-active').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
}

// ─── wp_create_post ──────────────────────────────────────────────────────────

export interface WpCreatePostOptions {
  /** Post status: 'publish' | 'draft'. Defaults to 'publish'. */
  status?: 'publish' | 'draft';
  /** Category name to select (optional). */
  category?: string;
}

export async function wpCreatePost(
  page: Page,
  title: string,
  content: string,
  options: WpCreatePostOptions = {}
): Promise<WpStepResult> {
  try {
    const base = page.url().replace(/\/wp-admin.*/, '');
    await page.goto(`${base}/wp-admin/post-new.php`, { waitUntil: 'load' });
    await dismissNotices(page);

    // Check for Gutenberg (block editor) vs Classic Editor
    const isGutenberg = await page.locator('.block-editor').isVisible().catch(() => false);

    if (isGutenberg) {
      // Gutenberg block editor
      // Close any welcome modals
      await page.locator('button[aria-label="Close"]').click().catch(() => {});

      // Title field
      const titleField = page.locator('[aria-label="Add title"], .editor-post-title__input, h1[contenteditable="true"]').first();
      await titleField.waitFor({ timeout: 10_000 });
      await titleField.click();
      await titleField.fill(title);

      // Content — click the default paragraph block and type
      const contentBlock = page.locator('.block-editor-default-block-appender__content, [aria-label="Empty block; start writing or type forward slash to choose a block"], p[data-empty="true"]').first();
      if (await contentBlock.isVisible().catch(() => false)) {
        await contentBlock.click();
      }
      await page.keyboard.type(content);

      // Publish
      if (options.status !== 'draft') {
        // Open publish panel
        const publishButton = page.locator('button:has-text("Publish"), .editor-post-publish-button__button').first();
        await publishButton.click();
        // Confirm publish (Gutenberg has a two-step publish)
        const confirmPublish = page.locator('.editor-post-publish-button:not([aria-disabled="true"])').first();
        if (await confirmPublish.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await confirmPublish.click();
        }
        // Wait for success
        await page.locator('.editor-post-publish-panel__header, .components-snackbar').first().waitFor({ timeout: 15_000 }).catch(() => {});
      }
    } else {
      // Classic Editor
      const titleInput = page.locator('#title');
      await titleInput.waitFor({ timeout: 10_000 });
      await titleInput.fill(title);

      // Content — try TinyMCE text tab first, then plain textarea
      const textTab = page.locator('#content-html');
      if (await textTab.isVisible().catch(() => false)) {
        await textTab.click();
      }
      await page.locator('#content').fill(content);

      // Publish
      if (options.status === 'draft') {
        await page.locator('#save-post').click();
      } else {
        // Ensure status is set to publish
        const publishRadio = page.locator('#publish');
        if (await publishRadio.isVisible().catch(() => false)) {
          await publishRadio.click();
        }
        await page.locator('#publish').click();
      }
      await page.waitForSelector('#message.updated, .notice-success', { timeout: 15_000 });
    }

    return pass();
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ─── wp_edit_page ────────────────────────────────────────────────────────────

export interface WpEditPageUpdates {
  title?: string;
  content?: string;
}

export async function wpEditPage(
  page: Page,
  pageId: string | number,
  updates: WpEditPageUpdates
): Promise<WpStepResult> {
  try {
    const base = page.url().replace(/\/wp-admin.*/, '');
    await page.goto(`${base}/wp-admin/post.php?post=${pageId}&action=edit`, { waitUntil: 'load' });
    await dismissNotices(page);

    const isGutenberg = await page.locator('.block-editor').isVisible().catch(() => false);

    if (isGutenberg) {
      // Close any welcome modals
      await page.locator('button[aria-label="Close"]').click().catch(() => {});

      if (updates.title) {
        const titleField = page.locator('[aria-label="Add title"], .editor-post-title__input, h1[contenteditable="true"]').first();
        await titleField.waitFor({ timeout: 10_000 });
        await titleField.click();
        await titleField.fill('');
        await titleField.fill(updates.title);
      }

      if (updates.content) {
        // Select all existing content and replace
        await page.keyboard.press('Control+a');
        await page.keyboard.type(updates.content);
      }

      // Update
      const updateButton = page.locator('button:has-text("Update"), .editor-post-publish-button').first();
      await updateButton.click();
      await page.locator('.components-snackbar, .editor-post-saved-state.is-saved').first().waitFor({ timeout: 15_000 }).catch(() => {});
    } else {
      // Classic Editor
      if (updates.title) {
        const titleInput = page.locator('#title');
        await titleInput.waitFor({ timeout: 10_000 });
        await titleInput.fill(updates.title);
      }

      if (updates.content) {
        const textTab = page.locator('#content-html');
        if (await textTab.isVisible().catch(() => false)) {
          await textTab.click();
        }
        await page.locator('#content').fill(updates.content);
      }

      await page.locator('#publish').click();
      await page.waitForSelector('#message.updated, .notice-success', { timeout: 15_000 });
    }

    return pass();
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ─── wp_check_frontend ───────────────────────────────────────────────────────

export async function wpCheckFrontend(
  page: Page,
  slug: string
): Promise<WpStepResult> {
  try {
    const base = page.url().replace(/\/wp-admin.*/, '').replace(/\/$/, '');
    const frontendUrl = `${base}/${slug.replace(/^\//, '')}`;
    const response = await page.goto(frontendUrl, { waitUntil: 'load' });

    if (!response) {
      return fail(`No response when navigating to ${frontendUrl}`);
    }

    const status = response.status();
    if (status >= 400) {
      return fail(`Frontend returned HTTP ${status} for slug "${slug}"`);
    }

    // Verify the page has rendered content (not a blank page or WP error)
    const body = page.locator('body');
    await body.waitFor({ timeout: 10_000 });
    const bodyText = await body.textContent() ?? '';

    if (bodyText.trim().length === 0) {
      return fail(`Frontend page "${slug}" rendered with empty body`);
    }

    // Check for common WordPress error indicators
    const hasError = await page.locator('.wp-die-message, .error-404').isVisible().catch(() => false);
    if (hasError) {
      return fail(`Frontend page "${slug}" shows a WordPress error or 404`);
    }

    return pass();
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ─── wp_woocommerce_add_product ──────────────────────────────────────────────

export interface WpWooCommerceProductOptions {
  /** Product type: 'simple' | 'variable'. Defaults to 'simple'. */
  type?: 'simple' | 'variable';
  /** Short description (optional). */
  shortDescription?: string;
  /** SKU (optional). */
  sku?: string;
  /** Publish immediately. Defaults to true. */
  publish?: boolean;
}

export async function wpWooCommerceAddProduct(
  page: Page,
  name: string,
  price: string | number,
  options: WpWooCommerceProductOptions = {}
): Promise<WpStepResult> {
  try {
    const base = page.url().replace(/\/wp-admin.*/, '');
    await page.goto(`${base}/wp-admin/post-new.php?post_type=product`, { waitUntil: 'load' });

    // Verify WooCommerce is active by checking the product edit screen loaded
    const productTitle = page.locator('#title');
    const titleVisible = await productTitle.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!titleVisible) {
      return fail('WooCommerce product editor not available — is WooCommerce active?');
    }

    await dismissNotices(page);

    // Product name
    await productTitle.fill(name);

    // Product type
    if (options.type && options.type !== 'simple') {
      const productTypeSelect = page.locator('#product-type');
      if (await productTypeSelect.isVisible().catch(() => false)) {
        await productTypeSelect.selectOption(options.type);
      }
    }

    // Regular price — click the General tab first
    const generalTab = page.locator('.general_options a, a[href="#general_product_data"]').first();
    if (await generalTab.isVisible().catch(() => false)) {
      await generalTab.click();
    }
    const priceField = page.locator('#_regular_price');
    if (await priceField.isVisible().catch(() => false)) {
      await priceField.fill(String(price));
    }

    // SKU
    if (options.sku) {
      const skuField = page.locator('#_sku');
      if (await skuField.isVisible().catch(() => false)) {
        await skuField.fill(options.sku);
      }
    }

    // Short description
    if (options.shortDescription) {
      const descTextTab = page.locator('#excerpt-html');
      if (await descTextTab.isVisible().catch(() => false)) {
        await descTextTab.click();
      }
      const excerptField = page.locator('#excerpt');
      if (await excerptField.isVisible().catch(() => false)) {
        await excerptField.fill(options.shortDescription);
      }
    }

    // Publish
    if (options.publish !== false) {
      await page.locator('#publish').click();
      await page.waitForSelector('#message.updated, .notice-success', { timeout: 15_000 });
    } else {
      await page.locator('#save-post').click();
      await page.waitForSelector('#message.updated, .notice-success', { timeout: 15_000 });
    }

    return pass();
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ─── wp_verify_plugin_settings ───────────────────────────────────────────────

export async function wpVerifyPluginSettings(
  page: Page,
  pluginSlug: string,
  expectedValues: Record<string, string | boolean | number>
): Promise<WpStepResult> {
  try {
    const base = page.url().replace(/\/wp-admin.*/, '');
    // Common settings page URL patterns for WordPress plugins
    const settingsUrls = [
      `${base}/wp-admin/admin.php?page=${pluginSlug}`,
      `${base}/wp-admin/options-general.php?page=${pluginSlug}`,
      `${base}/wp-admin/admin.php?page=${pluginSlug}-settings`,
    ];

    let navigated = false;
    for (const settingsUrl of settingsUrls) {
      const response = await page.goto(settingsUrl, { waitUntil: 'load' });
      if (response && response.status() < 400) {
        // Check we are actually on a settings page (not redirected to dashboard)
        const currentUrl = page.url();
        if (currentUrl.includes(pluginSlug)) {
          navigated = true;
          break;
        }
      }
    }

    if (!navigated) {
      return fail(`Could not find settings page for plugin "${pluginSlug}"`);
    }

    await dismissNotices(page);

    const mismatches: string[] = [];

    for (const [fieldName, expectedValue] of Object.entries(expectedValues)) {
      // Try multiple selector strategies to find the field
      const selectors = [
        `[name="${fieldName}"]`,
        `#${fieldName}`,
        `[data-setting="${fieldName}"]`,
        `[id*="${fieldName}"]`,
      ];

      let found = false;
      for (const selector of selectors) {
        const field = page.locator(selector).first();
        const isVisible = await field.isVisible().catch(() => false);
        if (!isVisible) continue;

        found = true;
        const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

        let actualValue: string | boolean;

        if (tagName === 'input') {
          const inputType = await field.getAttribute('type') ?? 'text';
          if (inputType === 'checkbox') {
            actualValue = await field.isChecked();
          } else {
            actualValue = await field.inputValue();
          }
        } else if (tagName === 'select') {
          actualValue = await field.inputValue();
        } else if (tagName === 'textarea') {
          actualValue = await field.inputValue();
        } else {
          actualValue = (await field.textContent()) ?? '';
        }

        // Compare values (loose string comparison for non-boolean)
        if (typeof expectedValue === 'boolean') {
          if (actualValue !== expectedValue) {
            mismatches.push(`${fieldName}: expected ${expectedValue}, got ${actualValue}`);
          }
        } else if (String(actualValue) !== String(expectedValue)) {
          mismatches.push(`${fieldName}: expected "${expectedValue}", got "${actualValue}"`);
        }

        break;
      }

      if (!found) {
        mismatches.push(`${fieldName}: field not found on settings page`);
      }
    }

    if (mismatches.length > 0) {
      return fail(`Plugin settings mismatches:\n${mismatches.join('\n')}`);
    }

    return pass();
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
