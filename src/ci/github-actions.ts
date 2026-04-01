/**
 * GitHub Actions helpers — parse test results, generate PR comments.
 */

import type { SuiteResult } from '../runner/suite-runner.js';
import type { StepResult } from '../runner/step-executor.js';

// ─── Parse test results ───────────────────────────────────────────────────────

export interface ParsedResults {
  totalFlows: number;
  passedFlows: number;
  failedFlows: number;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  duration_ms: number;
  failures: Array<{ flow: string; step: string; error: string }>;
}

export function parseTestResults(result: SuiteResult): ParsedResults {
  const failures: ParsedResults['failures'] = [];

  let totalSteps = 0;
  let passedSteps = 0;
  let failedSteps = 0;

  for (const flow of result.flows) {
    for (const step of flow.steps) {
      totalSteps++;
      if (step.status === 'pass') passedSteps++;
      else if (step.status === 'fail') {
        failedSteps++;
        failures.push({ flow: flow.flow, step: step.action, error: step.error ?? 'Unknown error' });
      }
    }
    // Flow-level error with no steps
    if (flow.status === 'fail' && flow.steps.length === 0 && flow.error) {
      failures.push({ flow: flow.flow, step: 'suite', error: flow.error });
    }
  }

  return {
    totalFlows: result.flows.length,
    passedFlows: result.flows.filter((f) => f.status === 'pass').length,
    failedFlows: result.flows.filter((f) => f.status === 'fail').length,
    totalSteps,
    passedSteps,
    failedSteps,
    duration_ms: result.duration_ms,
    failures,
  };
}

// ─── Generate PR comment ──────────────────────────────────────────────────────

export function generatePRComment(result: SuiteResult, reportUrl?: string): string {
  const parsed = parseTestResults(result);
  const statusEmoji = result.status === 'pass' ? '✅' : '❌';
  const lines: string[] = [
    `## ${statusEmoji} Vision Test Harness — ${result.suite}`,
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Status | **${result.status.toUpperCase()}** |`,
    `| Flows | ${parsed.passedFlows}/${parsed.totalFlows} passed |`,
    `| Steps | ${parsed.passedSteps}/${parsed.totalSteps} passed |`,
    `| Duration | ${(parsed.duration_ms / 1000).toFixed(1)}s |`,
  ];

  if (parsed.failures.length > 0) {
    lines.push('', '### Failures', '');
    for (const f of parsed.failures.slice(0, 10)) {
      lines.push(`- **${f.flow}** / \`${f.step}\`: ${f.error}`);
    }
    if (parsed.failures.length > 10) {
      lines.push(`- _...and ${parsed.failures.length - 10} more_`);
    }
  }

  if (reportUrl) {
    lines.push('', `[View full report](${reportUrl})`);
  }

  lines.push('', '_Powered by [Vision Test Harness](https://upgpt.ai/tools/test-harness)_');

  return lines.join('\n');
}

// ─── Set GitHub Actions output ────────────────────────────────────────────────

export function setGitHubOutput(result: SuiteResult): void {
  const parsed = parseTestResults(result);
  const outputLines = [
    `status=${result.status}`,
    `passed_flows=${parsed.passedFlows}`,
    `failed_flows=${parsed.failedFlows}`,
    `total_steps=${parsed.totalSteps}`,
    `passed_steps=${parsed.passedSteps}`,
  ];

  // GitHub Actions output format
  for (const line of outputLines) {
    process.stdout.write(`::set-output name=${line}\n`);
  }

  if (result.status === 'fail') {
    process.exitCode = 1;
  }
}
