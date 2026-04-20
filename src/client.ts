/**
 * BYOK config — stores AI provider key for local AI diagnosis.
 * No accounts, no login, no remote calls.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.vision-test-harness.json');

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ClientConfig {
  byok_key?: string;
  byok_provider?: 'openai' | 'anthropic' | 'gemini';
}

export function getConfig(): ClientConfig {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as ClientConfig;
  } catch {
    return {};
  }
}

function saveConfig(config: ClientConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// ─── BYOK ─────────────────────────────────────────────────────────────────────

export function configureByok(provider: ClientConfig['byok_provider'], key: string): void {
  const config = getConfig();
  config.byok_key = key;
  config.byok_provider = provider;
  saveConfig(config);
}

export function clearByok(): void {
  const config = getConfig();
  delete config.byok_key;
  delete config.byok_provider;
  saveConfig(config);
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function getStatus(): { hasByok: boolean; byok_provider?: string } {
  const config = getConfig();
  return {
    hasByok: !!config.byok_key,
    byok_provider: config.byok_provider,
  };
}

// ─── Resolve AI key (config or env vars) ─────────────────────────────────────

export function resolveByok(): { key: string; provider: 'openai' | 'anthropic' | 'gemini' } | null {
  const config = getConfig();
  if (config.byok_key && config.byok_provider) {
    return { key: config.byok_key, provider: config.byok_provider };
  }
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, provider: 'anthropic' };
  if (process.env.OPENAI_API_KEY) return { key: process.env.OPENAI_API_KEY, provider: 'openai' };
  if (process.env.GEMINI_API_KEY) return { key: process.env.GEMINI_API_KEY, provider: 'gemini' };
  return null;
}
