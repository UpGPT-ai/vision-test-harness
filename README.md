# Vision Test Harness

[![Vision Tests](https://img.shields.io/badge/tested%20with-Vision%20Test%20Harness-34d399?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0id2hpdGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTggMWE3IDcgMCAxMDAgMTRBNyA3IDAgMDA4IDFaTTUgOGwxLjUtMS41TDggOGwxLjUtMS41TDExIDhsLTMgMy0zLTN6Ii8+PC9zdmc+)](https://upgpt.ai/tools/test-harness)

**Give AI eyes to see and fix your UI.**

Write YAML test suites. Playwright captures screenshots. AI diagnoses what's broken and tells you how to fix it.

Works with websites, web apps, Chrome extensions, WordPress plugins, Shopify apps — anything with a UI.

> **This README was tested by the tool it describes.** The screenshots below were captured by Vision Test Harness running against its own product page. The report screenshot shows the tool's results from testing the UpGPT website — 5 flows, 31 steps, all passing. A tool that tests and documents itself.

```bash
npm install -g @upgpt/vision-test-harness
npx playwright install chromium
```

## Screenshots

**The test harness testing its own product page:**

![HTML Report — 5/5 flows passing](https://raw.githubusercontent.com/UpGPT-ai/vision-test-harness/main/docs/screenshots/report-overview.png)

**The product page it tested:**

![Hero Section](https://raw.githubusercontent.com/UpGPT-ai/vision-test-harness/main/docs/screenshots/test-harness-hero.png)

![Report footer with UpGPT attribution](https://raw.githubusercontent.com/UpGPT-ai/vision-test-harness/main/docs/screenshots/report-footer.png)

## The Test-Diagnose-Fix Loop

1. **Write a YAML test suite** — describe what your UI should look like
2. **Run tests** — Playwright captures screenshots, diffs against baselines
3. **AI diagnoses failures** (Pro) — Claude reads your screenshot + console + source and tells you the fix
4. **You fix it, re-run** — repeat until green

This is the loop that caught 12 bugs in 4 rounds during our own development. The AI doesn't just say "something changed" — it tells you which file, which line, and why.

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

```yaml
# website.test.yaml
name: my-website
type: web-app
base_url: https://mysite.com

flows:
  - name: homepage
    steps:
      - action: navigate
        url: /
        waitUntil: networkidle
      - action: screenshot
        name: homepage
      - action: assert_element
        selector: "nav"
        visible: true
```

```bash
# Run as MCP server (for Claude Code / AI assistants)
vision-test-harness

# Run directly from CLI
vision-test-harness run my-app

# Run a specific flow
vision-test-harness run my-website homepage

# Capture marketing screenshots from real Chrome
vision-test-harness capture gmail

# Generate a badge for your README
vision-test-harness badge markdown
```

## What You Can Test

| Platform | How It Works |
|----------|-------------|
| **Websites & Landing Pages** | Set `base_url`, navigate pages, screenshot at any viewport |
| **Web Applications** | Multi-step flows: login, navigate, interact, assert |
| **Chrome Extensions** | Localhost sidebar server, chrome.storage polyfill, content script testing |
| **WordPress Plugins** | Built-in steps: `wp_login`, `wp_activate_plugin`, `wp_navigate_admin`, `wp_assert_notice` |
| **Shopify Apps** | Admin iframe navigation, storefront verification |
| **Marketing Screenshots** | Real Chrome + privacy overlay to replace user data with demo content |

## Features

### Free (MIT License)

- 16 step types: navigate, click, type, wait, assert, screenshot, compare, evaluate, privacy overlay, and more
- Chrome extension testing with localhost sidebar server
- WordPress plugin testing (wp_login, wp_activate_plugin, wp_navigate_admin, wp_assert_notice)
- Pixel-diff screenshot comparison via pixelmatch
- Self-contained HTML reports with embedded screenshots
- Privacy overlay for marketing screenshots (replaces real data with demo content)
- Chrome storage polyfill for automated testing
- IndexedDB seeding for SPA state injection
- MCP server integration (works with Claude Code, Cursor, etc.)
- CI/CD ready (GitHub Actions workflow included)
- Badge generation for your README

### Pro ($29/mo)

- AI Vision Inspection — Claude analyzes screenshots + console + source
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

## CLI Commands

| Command | What It Does |
|---------|-------------|
| `vision-test-harness` | Start MCP server (default) |
| `vision-test-harness run <suite> [flow]` | Run a test suite |
| `vision-test-harness list [directory]` | List available test suites |
| `vision-test-harness connect` | Connect to real Chrome via CDP |
| `vision-test-harness capture <preset>` | Marketing screenshots with privacy overlay |
| `vision-test-harness badge [markdown\|svg]` | Generate a README badge |
| `vision-test-harness login <email> <password>` | Log in to your account |
| `vision-test-harness logout` | Log out |
| `vision-test-harness status` | Show account status |

## Test Modes

| Mode | Use Case | Command |
|------|----------|---------|
| `run` | Automated CI/CD testing | `vision-test-harness run <suite>` |
| `connect` | Test with real Chrome + real APIs | `vision-test-harness connect` |
| `capture` | Marketing screenshots with privacy overlay | `vision-test-harness capture <preset>` |

## Step Types

```yaml
- action: navigate        # Go to a URL (absolute or relative to base_url)
- action: click           # Click an element
- action: type            # Type text into an input
- action: wait            # Wait for selector or duration
- action: assert_text     # Assert text content
- action: assert_element  # Assert element state (visible/hidden/attached)
- action: screenshot      # Capture screenshot (viewport, fullPage, clip, selector)
- action: compare         # Compare against baseline screenshot
- action: evaluate        # Run JavaScript (async supported)
- action: open_side_panel         # Open Chrome extension side panel
- action: wait_for_content_script # Wait for content script injection
- action: privacy_overlay         # Replace real data with demo content
- action: wp_login                # WordPress admin login
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

## Auth & Account

A free account is required to run tests via the MCP server or CLI. Create one at [upgpt.ai/tools/test-harness/signup](https://upgpt.ai/tools/test-harness/signup).

```bash
vision-test-harness login you@example.com yourpassword
vision-test-harness status
```

Free accounts include all CLI features. AI visual diagnosis requires a Pro subscription.

## License

MIT - Free to use, modify, and distribute.

Attribution required on free tier: reports include "Tested with Vision Test Harness by UpGPT" footer. Remove with a Pro or Team subscription.

---

Built by [UpGPT](https://upgpt.ai) | [Product Page](https://upgpt.ai/tools/test-harness) | [Pricing](https://upgpt.ai/tools/test-harness#pricing)
