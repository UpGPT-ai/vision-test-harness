/**
 * Zod validation schemas for Vision Test Harness YAML config files.
 */

import { z } from 'zod';

// ─── Step action types ────────────────────────────────────────────────────────

const BaseStepSchema = z.object({
  action: z.string(),
  description: z.string().optional(),
});

const NavigateStepSchema = BaseStepSchema.extend({
  action: z.literal('navigate'),
  url: z.string(),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
});

const ClickStepSchema = BaseStepSchema.extend({
  action: z.literal('click'),
  selector: z.string(),
  timeout: z.number().optional(),
});

const TypeStepSchema = BaseStepSchema.extend({
  action: z.literal('type'),
  selector: z.string(),
  text: z.string(),
  delay: z.number().optional(),
});

const WaitStepSchema = BaseStepSchema.extend({
  action: z.literal('wait'),
  ms: z.number().optional(),
  selector: z.string().optional(),
  timeout: z.number().optional(),
});

const AssertTextStepSchema = BaseStepSchema.extend({
  action: z.literal('assert_text'),
  selector: z.string(),
  text: z.string(),
  contains: z.boolean().optional(),
});

const AssertElementStepSchema = BaseStepSchema.extend({
  action: z.literal('assert_element'),
  selector: z.string(),
  visible: z.boolean().optional(),
  exists: z.boolean().optional(),
});

const ScreenshotStepSchema = BaseStepSchema.extend({
  action: z.literal('screenshot'),
  name: z.string(),
  fullPage: z.boolean().optional(),
  clip: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
});

const CompareStepSchema = BaseStepSchema.extend({
  action: z.literal('compare'),
  name: z.string(),
  threshold: z.number().optional(),
  fullPage: z.boolean().optional(),
});

const OpenSidePanelStepSchema = BaseStepSchema.extend({
  action: z.literal('open_side_panel'),
  timeout: z.number().optional(),
});

const WaitForContentScriptStepSchema = BaseStepSchema.extend({
  action: z.literal('wait_for_content_script'),
  timeout: z.number().optional(),
  selector: z.string().optional(),
});

const EvaluateStepSchema = BaseStepSchema.extend({
  action: z.literal('evaluate'),
  script: z.string(),
  expect: z.unknown().optional(),
});

// ─── WordPress-specific steps ─────────────────────────────────────────────────

const WpLoginStepSchema = BaseStepSchema.extend({
  action: z.literal('wp_login'),
  url: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

const WpActivatePluginStepSchema = BaseStepSchema.extend({
  action: z.literal('wp_activate_plugin'),
  plugin_slug: z.string(),
});

const WpNavigateAdminStepSchema = BaseStepSchema.extend({
  action: z.literal('wp_navigate_admin'),
  path: z.string(),
});

const WpAssertNoticeStepSchema = BaseStepSchema.extend({
  action: z.literal('wp_assert_notice'),
  text: z.string(),
  type: z.enum(['success', 'error', 'warning', 'info']).optional(),
});

const WpCreatePostStepSchema = BaseStepSchema.extend({
  action: z.literal('wp_create_post'),
  title: z.string(),
  content: z.string(),
  status: z.enum(['publish', 'draft']).optional(),
  category: z.string().optional(),
});

const WpEditPageStepSchema = BaseStepSchema.extend({
  action: z.literal('wp_edit_page'),
  page_id: z.union([z.string(), z.number()]),
  title: z.string().optional(),
  content: z.string().optional(),
});

const WpCheckFrontendStepSchema = BaseStepSchema.extend({
  action: z.literal('wp_check_frontend'),
  slug: z.string(),
});

const WpWooCommerceAddProductStepSchema = BaseStepSchema.extend({
  action: z.literal('wp_woocommerce_add_product'),
  name: z.string(),
  price: z.union([z.string(), z.number()]),
  product_type: z.enum(['simple', 'variable']).optional(),
  short_description: z.string().optional(),
  sku: z.string().optional(),
  publish: z.boolean().optional(),
});

const WpVerifyPluginSettingsStepSchema = BaseStepSchema.extend({
  action: z.literal('wp_verify_plugin_settings'),
  plugin_slug: z.string(),
  expected_values: z.record(z.union([z.string(), z.boolean(), z.number()])),
});

// ─── Privacy overlay step ─────────────────────────────────────────────────────

const PrivacyOverlayStepSchema = BaseStepSchema.extend({
  action: z.literal('privacy_overlay'),
  preset: z.enum(['gmail', 'wordpress-admin', 'shopify-admin', 'generic']).optional(),
  demo_data: z.array(z.object({
    sender: z.string(),
    subject: z.string(),
    snippet: z.string(),
  })).optional(),
  rules: z.array(z.object({
    selector: z.string(),
    text: z.string().optional(),
    action: z.enum(['replace', 'hide', 'blur']).optional(),
  })).optional(),
  hide_profile: z.boolean().optional(),
});

// ─── Union step schema ────────────────────────────────────────────────────────

export const StepSchema = z.discriminatedUnion('action', [
  NavigateStepSchema,
  ClickStepSchema,
  TypeStepSchema,
  WaitStepSchema,
  AssertTextStepSchema,
  AssertElementStepSchema,
  ScreenshotStepSchema,
  CompareStepSchema,
  OpenSidePanelStepSchema,
  WaitForContentScriptStepSchema,
  EvaluateStepSchema,
  WpLoginStepSchema,
  WpActivatePluginStepSchema,
  WpNavigateAdminStepSchema,
  WpAssertNoticeStepSchema,
  WpCreatePostStepSchema,
  WpEditPageStepSchema,
  WpCheckFrontendStepSchema,
  WpWooCommerceAddProductStepSchema,
  WpVerifyPluginSettingsStepSchema,
  PrivacyOverlayStepSchema,
]);

export type Step = z.infer<typeof StepSchema>;

// ─── Flow schema ──────────────────────────────────────────────────────────────

export const FlowSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(StepSchema),
});

export type Flow = z.infer<typeof FlowSchema>;

// ─── Seed data schema ─────────────────────────────────────────────────────────

export const SeedDataSchema = z.object({
  chrome_storage: z.record(z.unknown()).optional(),
  chrome_storage_sync: z.record(z.unknown()).optional(),
  chrome_storage_local: z.record(z.unknown()).optional(),
  local_storage: z.record(z.string()).optional(),
  indexed_db: z.array(z.object({
    db: z.string(),
    store: z.string(),
    records: z.array(z.unknown()),
  })).optional(),
});

export type SeedData = z.infer<typeof SeedDataSchema>;

// ─── View skill schema ────────────────────────────────────────────────────────

export const ViewSkillSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  selector: z.string().optional(),
  source_file: z.string().optional(),
  source_function: z.string().optional(),
});

export type ViewSkill = z.infer<typeof ViewSkillSchema>;

// ─── CWS asset schema ─────────────────────────────────────────────────────────

export const CwsAssetSchema = z.object({
  flow: z.string(),
  screenshot: z.string(),
  caption: z.string().optional(),
  crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
});

export type CwsAsset = z.infer<typeof CwsAssetSchema>;

// ─── Test suite schema ────────────────────────────────────────────────────────

export const TestSuiteSchema = z.object({
  name: z.string(),
  type: z.enum(['chrome-extension', 'shopify-plugin', 'wordpress-plugin', 'wix-plugin', 'web-app']),
  description: z.string().optional(),
  extension_path: z.string().optional(),
  base_url: z.string().optional(),
  seed_data: SeedDataSchema.optional(),
  view_skills: z.array(ViewSkillSchema).optional(),
  cws_assets: z.array(CwsAssetSchema).optional(),
  // WordPress MCP adapter fields
  wp_mcp_endpoint: z.string().optional(),
  wp_mcp_key: z.string().optional(),
  wp_admin_url: z.string().optional(),
  wp_username: z.string().optional(),
  wp_password: z.string().optional(),
  flows: z.array(FlowSchema),
});

export type TestSuite = z.infer<typeof TestSuiteSchema>;
