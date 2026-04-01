/**
 * Chrome CDP connect — attach to a running Chrome instance via remote debugging.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const DEBUG_PORT = 9222;

// ─── Wait for debug port ──────────────────────────────────────────────────────

export async function waitForDebugPort(port = DEBUG_PORT, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/json/version`, (res) => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Chrome debug port ${port} not available after ${timeout}ms`);
}

// ─── Connect to Chrome ────────────────────────────────────────────────────────

export async function connectToChrome(port = DEBUG_PORT): Promise<{ browser: Browser; context: BrowserContext }> {
  await waitForDebugPort(port);
  const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
  const contexts = browser.contexts();
  const context = contexts[0] ?? await browser.newContext();
  return { browser, context };
}

// ─── Sidebar static server ────────────────────────────────────────────────────

export interface SidebarServer {
  port: number;
  close(): void;
}

export function startSidebarServer(sidebarDir: string, port = 0): Promise<SidebarServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url === '/' ? '/index.html' : (req.url ?? '/index.html');
      // Path traversal guard
      const safePath = path.resolve(sidebarDir, '.' + urlPath);
      if (!safePath.startsWith(path.resolve(sidebarDir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(safePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(safePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' });
        res.end(data);
      });
    });

    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      resolve({ port: addr.port, close: () => server.close() });
    });

    server.on('error', reject);
  });
}
