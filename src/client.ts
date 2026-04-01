/**
 * CLI auth client — token management and premium API calls.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.vision-test-harness.json');
// Premium API routes through the main site (deployed as Next.js API routes)
// Falls back to Supabase edge functions if the main site is unreachable
const PREMIUM_API = 'https://upgpt.ai/api/v1/licenses';

// ─── Config types ─────────────────────────────────────────────────────────────

export interface ClientConfig {
  token?: string;
  email?: string;
  tier?: 'free' | 'pro' | 'team';
  byok_key?: string;
  byok_provider?: 'openai' | 'anthropic' | 'gemini';
}

// ─── Read/write config ────────────────────────────────────────────────────────

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

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<ClientConfig> {
  const resp = await fetch(`${PREMIUM_API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!resp.ok) {
    throw new Error(`Login failed: ${await resp.text()}`);
  }

  const data = (await resp.json()) as { token: string; tier: ClientConfig['tier'] };
  const config: ClientConfig = { ...getConfig(), token: data.token, email, tier: data.tier };
  saveConfig(config);
  return config;
}

export function logout(): void {
  const config = getConfig();
  delete config.token;
  delete config.email;
  delete config.tier;
  saveConfig(config);
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

// ─── Premium API ──────────────────────────────────────────────────────────────

export async function callPremiumApi(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const config = getConfig();

  if (!config.token) {
    throw new Error('Not logged in. Run `vision-test-harness login` to activate premium features.');
  }

  const resp = await fetch(`${PREMIUM_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error(`Premium API error ${resp.status}: ${await resp.text()}`);
  }

  return resp.json();
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function getStatus(): { loggedIn: boolean; email?: string; tier?: string; hasByok: boolean } {
  const config = getConfig();
  return {
    loggedIn: !!config.token,
    email: config.email,
    tier: config.tier,
    hasByok: !!config.byok_key,
  };
}
