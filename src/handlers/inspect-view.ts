/**
 * Vision-aware inspection handler.
 * Returns screenshot, console logs, network errors, source code, and AI diagnosis via BYOK.
 */

import type { Page } from 'playwright';
import type { ConsoleEntry, NetworkError, BrowserSession } from '../browser/launcher.js';
import type { ViewSkill } from '../schema.js';
import { resolveByok } from '../client.js';
import fs from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InspectOptions {
  selector?: string;
  sourceFile?: string;
}

export interface InspectResult {
  screenshot_base64: string;
  console_logs: ConsoleEntry[];
  sw_logs: ConsoleEntry[];
  network_errors: NetworkError[];
  source_code?: string;
  view_skills?: ViewSkill[];
  ai_diagnosis?: string;
  ai_provider?: string;
  ai_hint?: string;
}

// ─── Path traversal guard ─────────────────────────────────────────────────────

function safeReadFile(filePath: string, rootDir: string): string | null {
  const resolved = path.resolve(filePath);
  const root = path.resolve(rootDir);
  if (!resolved.startsWith(root)) return null;
  try {
    return fs.readFileSync(resolved, 'utf8');
  } catch {
    return null;
  }
}

// ─── AI diagnosis prompt ──────────────────────────────────────────────────────

function buildPrompt(
  consoleErrors: ConsoleEntry[],
  networkErrors: NetworkError[],
  viewSkills: ViewSkill[],
  sourceCode?: string
): string {
  const parts: string[] = [
    'You are a UI debugging assistant. Analyze this screenshot and the context below.',
    'Identify what is broken or incorrect in the UI.',
    'Be specific: name the exact file, line, or selector to fix.',
    '',
  ];

  if (consoleErrors.length > 0) {
    parts.push('Console errors:');
    consoleErrors.slice(0, 10).forEach((e) => parts.push(`  ${e.level}: ${e.text}`));
    parts.push('');
  }

  if (networkErrors.length > 0) {
    parts.push('Network errors:');
    networkErrors.slice(0, 5).forEach((e) => parts.push(`  ${e.url}: ${e.error ?? ''}`));
    parts.push('');
  }

  if (viewSkills.length > 0) {
    parts.push('Expected view skills (what should be visible):');
    viewSkills.forEach((s) => parts.push(`  - ${s.name}: ${s.description}`));
    parts.push('');
  }

  if (sourceCode) {
    parts.push('Source code (first 2000 chars):');
    parts.push(sourceCode.slice(0, 2000));
    parts.push('');
  }

  parts.push('Diagnosis: What is wrong, and exactly how should it be fixed?');
  return parts.join('\n');
}

// ─── Provider calls ───────────────────────────────────────────────────────────

async function callAnthropic(key: string, screenshot_base64: string, prompt: string): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot_base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic API error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { content: Array<{ type: string; text: string }> };
  return data.content.find((c) => c.type === 'text')?.text ?? '';
}

async function callOpenAI(key: string, screenshot_base64: string, prompt: string): Promise<string> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot_base64}` } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI API error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

async function callGemini(key: string, screenshot_base64: string, prompt: string): Promise<string> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/png', data: screenshot_base64 } },
            { text: prompt },
          ],
        }],
      }),
    }
  );
  if (!resp.ok) throw new Error(`Gemini API error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  return data.candidates[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
}

async function runAiDiagnosis(
  screenshot_base64: string,
  consoleErrors: ConsoleEntry[],
  networkErrors: NetworkError[],
  viewSkills: ViewSkill[],
  sourceCode?: string
): Promise<{ diagnosis: string; provider: string } | null> {
  const byok = resolveByok();
  if (!byok) return null;

  const prompt = buildPrompt(consoleErrors, networkErrors, viewSkills, sourceCode);

  switch (byok.provider) {
    case 'anthropic': return { diagnosis: await callAnthropic(byok.key, screenshot_base64, prompt), provider: 'claude-opus-4-7' };
    case 'openai':    return { diagnosis: await callOpenAI(byok.key, screenshot_base64, prompt), provider: 'gpt-4o' };
    case 'gemini':    return { diagnosis: await callGemini(byok.key, screenshot_base64, prompt), provider: 'gemini-2.0-flash' };
  }
}

// ─── Inspect live page ────────────────────────────────────────────────────────

export async function inspectView(
  page: Page,
  session: BrowserSession,
  viewSkills: ViewSkill[] = [],
  options: InspectOptions = {}
): Promise<InspectResult> {
  let screenshotBuffer: Buffer;
  if (options.selector) {
    const el = page.locator(options.selector).first();
    screenshotBuffer = await el.screenshot().catch(() => page.screenshot());
  } else {
    screenshotBuffer = await page.screenshot();
  }
  const screenshot_base64 = screenshotBuffer.toString('base64');

  let source_code: string | undefined;
  if (options.sourceFile) {
    source_code = safeReadFile(options.sourceFile, process.cwd()) ?? undefined;
  }

  const result: InspectResult = {
    screenshot_base64,
    console_logs: [...session.consoleLogs],
    sw_logs: [...session.swConsoleLogs],
    network_errors: [...session.networkErrors],
    source_code,
    view_skills: viewSkills.length > 0 ? viewSkills : undefined,
  };

  const consoleErrors = session.consoleLogs.filter((l) => l.level === 'error');
  const ai = await runAiDiagnosis(screenshot_base64, consoleErrors, session.networkErrors, viewSkills, source_code).catch(() => null);

  if (ai) {
    result.ai_diagnosis = ai.diagnosis;
    result.ai_provider = ai.provider;
  } else {
    result.ai_hint = 'Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY to enable AI diagnosis. Or run: vision-test-harness byok <anthropic|openai|gemini> <key>';
  }

  return result;
}

// ─── Diagnose saved screenshot (MCP mode) ─────────────────────────────────────

export async function diagnoseScreenshot(
  screenshotPath: string,
  context?: { console_errors?: string[]; source_file?: string }
): Promise<InspectResult> {
  if (!fs.existsSync(screenshotPath)) {
    throw new Error(`Screenshot not found: ${screenshotPath}`);
  }

  const screenshot_base64 = fs.readFileSync(screenshotPath).toString('base64');

  let source_code: string | undefined;
  if (context?.source_file) {
    source_code = safeReadFile(context.source_file, process.cwd()) ?? undefined;
  }

  const consoleErrors: ConsoleEntry[] = (context?.console_errors ?? []).map((text) => ({
    level: 'error' as const,
    text,
    timestamp: Date.now(),
    source: 'page' as const,
  }));

  const result: InspectResult = {
    screenshot_base64,
    console_logs: consoleErrors,
    sw_logs: [],
    network_errors: [],
    source_code,
  };

  const ai = await runAiDiagnosis(screenshot_base64, consoleErrors, [], [], source_code).catch(() => null);

  if (ai) {
    result.ai_diagnosis = ai.diagnosis;
    result.ai_provider = ai.provider;
  } else {
    result.ai_hint = 'Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY to enable AI diagnosis. Or run: vision-test-harness byok <anthropic|openai|gemini> <key>';
  }

  return result;
}
