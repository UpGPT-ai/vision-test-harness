/**
 * Self-contained HTML report generator — embedded base64 screenshots.
 */

import type { SuiteResult } from '../runner/suite-runner.js';
import type { StepResult } from '../runner/step-executor.js';
import fs from 'fs';
import path from 'path';

// ─── Embed screenshot as base64 ───────────────────────────────────────────────

function embedScreenshot(screenshotPath: string | undefined): string {
  if (!screenshotPath || !fs.existsSync(screenshotPath)) return '';
  const data = fs.readFileSync(screenshotPath).toString('base64');
  return `<img class="screenshot" src="data:image/png;base64,${data}" alt="screenshot" />`;
}

// ─── Step row ─────────────────────────────────────────────────────────────────

function renderStep(step: StepResult): string {
  const statusClass = step.status === 'pass' ? 'pass' : step.status === 'fail' ? 'fail' : 'skip';
  const statusIcon = step.status === 'pass' ? '✓' : step.status === 'fail' ? '✗' : '−';
  const diffHtml = step.diff_percent !== undefined
    ? `<span class="diff">Diff: ${step.diff_percent.toFixed(2)}%</span>`
    : '';
  const errorHtml = step.error ? `<div class="error">${escapeHtml(step.error)}</div>` : '';
  const screenshot = embedScreenshot(step.screenshot_path);

  return `
    <div class="step ${statusClass}">
      <span class="status-icon">${statusIcon}</span>
      <span class="action">${escapeHtml(step.action)}</span>
      <span class="duration">${step.duration_ms}ms</span>
      ${diffHtml}
      ${errorHtml}
      ${screenshot}
    </div>`;
}

// ─── Flow section ─────────────────────────────────────────────────────────────

function renderFlow(flow: { flow: string; status: string; steps: StepResult[]; duration_ms: number; error?: string }): string {
  const statusClass = flow.status === 'pass' ? 'pass' : 'fail';
  return `
    <div class="flow ${statusClass}">
      <h3>${escapeHtml(flow.flow)} <span class="badge ${statusClass}">${flow.status.toUpperCase()}</span>
          <span class="duration">${(flow.duration_ms / 1000).toFixed(1)}s</span></h3>
      ${flow.error ? `<div class="error flow-error">${escapeHtml(flow.error)}</div>` : ''}
      <div class="steps">
        ${flow.steps.map(renderStep).join('')}
      </div>
    </div>`;
}

// ─── HTML escape ─────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Generate report ──────────────────────────────────────────────────────────

export function generateHtmlReport(result: SuiteResult, outputPath: string): void {
  const passed = result.flows.filter((f) => f.status === 'pass').length;
  const failed = result.flows.filter((f) => f.status === 'fail').length;
  const totalSteps = result.flows.reduce((acc, f) => acc + f.steps.length, 0);
  const failedSteps = result.flows.reduce((acc, f) => acc + f.steps.filter((s) => s.status === 'fail').length, 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vision Test Harness — ${escapeHtml(result.suite)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f1117; color: #e2e8f0; font-family: 'Inter', system-ui, sans-serif; padding: 24px; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    h3 { font-size: 1rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .summary { background: #1a1d27; border-radius: 8px; padding: 16px; margin-bottom: 24px; display: flex; gap: 24px; }
    .stat { display: flex; flex-direction: column; gap: 4px; }
    .stat-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; }
    .stat-value { font-size: 1.5rem; font-weight: bold; }
    .pass-color { color: #34d399; }
    .fail-color { color: #f87171; }
    .flow { background: #1a1d27; border-radius: 8px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #334155; }
    .flow.pass { border-left-color: #34d399; }
    .flow.fail { border-left-color: #f87171; }
    .step { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid #1e2130; flex-wrap: wrap; }
    .step:last-child { border-bottom: none; }
    .status-icon { font-weight: bold; width: 16px; flex-shrink: 0; }
    .step.pass .status-icon { color: #34d399; }
    .step.fail .status-icon { color: #f87171; }
    .step.skip .status-icon { color: #94a3b8; }
    .action { font-family: monospace; font-size: 0.85rem; color: #93c5fd; }
    .duration { font-size: 0.75rem; color: #94a3b8; margin-left: auto; }
    .diff { font-size: 0.75rem; color: #fbbf24; }
    .error { color: #f87171; font-size: 0.8rem; width: 100%; font-family: monospace; margin-top: 4px; }
    .flow-error { margin-bottom: 8px; }
    .badge { font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
    .badge.pass { background: #064e3b; color: #34d399; }
    .badge.fail { background: #450a0a; color: #f87171; }
    .screenshot { max-width: 100%; border-radius: 4px; margin-top: 8px; border: 1px solid #334155; }
    footer { margin-top: 32px; text-align: center; font-size: 0.75rem; color: #475569; }
    footer a { color: #60a5fa; text-decoration: none; }
  </style>
</head>
<body>
  <h1>Vision Test Harness — ${escapeHtml(result.suite)}</h1>
  <div class="summary">
    <div class="stat">
      <span class="stat-label">Status</span>
      <span class="stat-value ${result.status === 'pass' ? 'pass-color' : 'fail-color'}">${result.status.toUpperCase()}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Flows</span>
      <span class="stat-value">${passed}/${passed + failed}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Steps</span>
      <span class="stat-value">${totalSteps - failedSteps}/${totalSteps}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Duration</span>
      <span class="stat-value">${(result.duration_ms / 1000).toFixed(1)}s</span>
    </div>
  </div>
  ${result.flows.map(renderFlow).join('')}
  <footer>
    Tested with <a href="https://github.com/upgpt-ai/vision-test-harness" target="_blank">Vision Test Harness</a> by
    <a href="https://upgpt.ai" target="_blank">UpGPT</a>
  </footer>
</body>
</html>`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
}
