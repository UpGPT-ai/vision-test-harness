# Vision Test Harness

**AI-powered visual testing for Chrome extensions, WordPress plugins, Shopify apps, and web apps.**

Write YAML test suites. Playwright captures screenshots. AI diagnoses what's wrong.

```
npm install -g @upgpt/vision-test-harness
```

## What It Does

1. **Write a YAML test suite** — define flows, seed data, capture screenshots
2. **Run tests** — Playwright automates the browser, captures screenshots at each step
3. **AI diagnoses failures** (Pro) — Claude sees your screenshot + console logs + source code + feature spec and tells you exactly what's wrong

## Quick Start

```yaml
# my-app.test.yaml
name: my-extension
type: chrome-extension
extension_path: ./dist
viewport: { width: 400, height: 600 }

flows:
  - name: dashboard
    steps:
      - action: navigate
        url: sidebar/index.html
      - action: wait
        ms: 2000
      - action: screenshot
        name: dashboard-view
      - action: assert_element
        selector: "[data-testid='main-content']"
        state: visible
```

```bash
# Run as MCP server (for Claude Code / AI assistants)
vision-test-harness

# Run directly from CLI
vision-test-harness run my-app

# Capture marketing screenshots from real Chrome
vision-test-harness capture gmail
```

## Features

### Free (MIT License)

- 15 step types: navigate, click, type, wait, assert, screenshot, compare, evaluate, privacy overlay, and more
- Chrome extension testing with localhost sidebar server
- WordPress plugin testing (wp_login, wp_activate_plugin, wp_navigate_admin, wp_assert_notice)
- Shopify app testing with iframe navigation
- Pixel-diff screenshot comparison via pixelmatch
- Self-contained HTML reports with embedded screenshots
- Privacy overlay for marketing screenshots (replaces real data with demo content)
- GitHub Actions CI/CD workflow
- Chrome storage polyfill for automated testing
- IndexedDB seeding for SPA state injection
- MCP server integration (works with Claude Code, Cursor, etc.)

### Pro ($29/mo)

- AI Vision Inspection — Claude analyzes screenshots + console + source + view skills
- Self-debugging loop: run tests, AI diagnoses, you fix, repeat
- BYOK (bring your own Claude/OpenAI key)
- Attribution-free reports

### Team ($99/mo)

- Shared team baselines
- Unlimited projects
- Priority support

## How It Works

The test harness runs as an [MCP server](https://modelcontextprotocol.io/) with 7 tools:

| Tool | What It Does |
|------|-------------|
| `list_test_suites` | Discover available YAML test suites |
| `test_run` | Execute a test suite, return results + screenshots |
| `inspect_view` | AI sees screenshot + console + source + feature spec |
| `screenshot` | Capture a screenshot of the current page |
| `compare_screenshots` | Pixel-diff two screenshots |
| `generate_cws_assets` | Generate Chrome Web Store listing images |
| `seed_test_data` | Inject test data into browser storage |

## Test Modes

| Mode | Use Case | Command |
|------|----------|---------|
| `run` | Automated CI/CD testing | `vision-test-harness run <suite>` |
| `connect` | Test with real Chrome + real APIs | `vision-test-harness connect` |
| `capture` | Marketing screenshots with privacy overlay | `vision-test-harness capture <preset>` |

## Step Types

```yaml
- action: navigate        # Go to a URL
- action: click           # Click an element
- action: type            # Type text into an input
- action: wait            # Wait for selector or duration
- action: assert_text     # Assert text content
- action: assert_element  # Assert element state (visible/hidden/attached)
- action: screenshot      # Capture screenshot (viewport, fullPage, clip, selector)
- action: compare         # Compare against baseline screenshot
- action: evaluate        # Run JavaScript (async supported)
- action: open_side_panel # Open Chrome extension side panel
- action: privacy_overlay # Replace real data with demo content
- action: wp_login        # WordPress admin login
- action: wp_activate_plugin
- action: wp_navigate_admin
- action: wp_assert_notice
```

## CI/CD

```yaml
# .github/workflows/visual-regression.yml
- uses: actions/setup-node@v4
  with: { node-version: 20 }
- run: npx playwright install chromium
- run: npx @upgpt/vision-test-harness run my-suite
```

## Privacy Overlay

Capture marketing screenshots from a real browser session with automatic PII replacement:

```yaml
- action: privacy_overlay
  preset: gmail          # gmail, wordpress-admin, shopify-admin, generic
  hide_profile: true
```

Replaces sender names, email subjects, snippets with demo data. Preserves injected UI elements (sparklines, badges). Your real data never appears in screenshots.

## License

MIT - Free to use, modify, and distribute.

Attribution required on free tier: reports include "Tested with Vision Test Harness by UpGPT" footer. Remove with a Pro or Team subscription.

---

Built by [UpGPT](https://upgpt.ai) | [Product Page](https://upgpt.ai/tools/test-harness) | [Documentation](https://upgpt.ai/tools/test-harness)
