# Vision Test Harness — Lessons Learned

## Last Updated: 2026-03-31

---

## 1. Chrome 146+ Silently Ignores `--load-extension`

Playwright's `launchPersistentContext` with `--load-extension` and `--disable-extensions-except` flags no longer works in Chrome 146+. Chrome accepts the flags without error but doesn't load the extension.

**Solution — Localhost Sidebar Mode (automated/CI):**
- Serve the extension's sidebar HTML/JS/CSS via a localhost HTTP server
- Navigate Chromium to `http://127.0.0.1:<port>/sidebar/index.html`
- Inject `chrome.storage` polyfill via `addInitScript`

**Solution — Real Chrome Mode (integration testing):**
- Launch Chrome manually: `chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-debug-profile"`
- Load extension via `chrome://extensions` → Developer Mode → Load Unpacked
- Connect Playwright via `chromium.connectOverCDP('http://127.0.0.1:9222')`

---

## 2. `addInitScript` Is the Only Reliable Way to Pre-Seed Data

SPA frameworks destroy execution contexts during re-renders. `page.evaluate()` after navigation fails with "Execution context was destroyed."

**Working Pattern:**
```javascript
await page.addInitScript((seedData) => {
  // Polyfill chrome.storage
  window.chrome = { storage: { sync: makeStore(seedData.sync), local: makeStore(seedData.local) } };
  // Pre-seed IndexedDB
  const req = indexedDB.open('appname');
  req.onsuccess = (e) => { /* write to stores */ };
}, data);

// THEN navigate — app reads pre-seeded data on mount
await page.goto(url);
```

---

## 3. IndexedDB Version Conflicts

If the app creates IDB at version N, test scripts that open at a lower version throw `VersionError`.

**Fix:** Open without specifying a version: `indexedDB.open('name')` — not `indexedDB.open('name', 3)`.

---

## 4. Content Scripts Can Inject Into Hidden DOM Elements

Complex web apps often have hidden duplicate DOM elements. `querySelector('[data-attr]')` can match a hidden copy, causing injected elements to have zero dimensions.

**Fix:** Walk up the parent chain before injecting:
```javascript
let hidden = false;
let parent = candidate.parentElement;
while (parent && parent !== container) {
  if (getComputedStyle(parent).display === 'none') { hidden = true; break; }
  parent = parent.parentElement;
}
```

---

## 5. Privacy Overlay Must Preserve Injected Child Elements

Setting `el.textContent = 'new text'` destroys ALL children. When overlaying fake data for marketing screenshots, replace only text nodes:
```javascript
for (const child of el.childNodes) {
  if (child.nodeType === 3) child.textContent = 'Demo';  // text node only
}
```

---

## 6. `--user-data-dir` Creates a Blank Profile

No extensions, no logins, no bookmarks. Extensions must be loaded fresh. Use `chrome.developerPrivate.loadUnpacked()` via CDP from the `chrome://extensions` page to programmatically load them, or instruct users to load manually.

---

## 7. CSS `!important` Required for Content Script Injection

Web apps with aggressive CSS (overflow: hidden, fixed widths, text-overflow: ellipsis) will collapse injected elements. Always use `!important` on dimensions, display, and overflow for DOM injected into third-party web apps.

---

## 8. Evaluate Steps Need Async IIFE Wrapping

`page.evaluate(string)` doesn't support top-level `await`. Wrap in async IIFE:
```javascript
const wrapped = `(async () => { ${userScript} })()`;
await page.evaluate(wrapped);
```

Add retry-on-context-destruction for SPA routers.

---

## Recommended Test Modes

| Mode | Use Case | Extension APIs | Best For |
|------|----------|---------------|----------|
| `run` (localhost) | CI/CD, automated testing | Polyfilled (mock) | Regression testing, sidebar screenshots |
| `connect` (real Chrome) | Integration testing | Real | Full extension testing with real APIs |
| `capture` (real Chrome) | Marketing screenshots | Real | Product images with privacy overlay |
