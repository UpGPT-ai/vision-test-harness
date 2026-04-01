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
  const resp = await fetch('https://upgpt.ai/api/v1/licenses/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!resp.ok) {
    throw new Error(`Login failed: ${await resp.text()}`);
  }

  const data = (await resp.json()) as { token: string; tier: ClientConfig['tier']; license_key?: string };
  const config: ClientConfig = { ...getConfig(), token: data.token, email, tier: data.tier };
  saveConfig(config);
  return config;
}

export async function signup(email: string, password: string): Promise<{ license_key: string | null; tier: string }> {
  const resp = await fetch('https://upgpt.ai/api/v1/licenses/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!resp.ok) {
    throw new Error(`Signup failed: ${await resp.text()}`);
  }

  const data = (await resp.json()) as { token: string; tier: string; license_key: string | null; email: string };
  // Persist the session so the user is logged in immediately after signup
  const config: ClientConfig = { ...getConfig(), token: data.token, email, tier: data.tier as ClientConfig['tier'] };
  saveConfig(config);
  return { license_key: data.license_key, tier: data.tier };
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

export interface RemoteStatus {
  loggedIn: boolean;
  email?: string;
  tier?: string;
  license_key?: string | null;
  credits_remaining?: number;
  expires_at?: string | null;
  hasByok: boolean;
  source: 'remote' | 'local';
}

export async function getRemoteStatus(): Promise<RemoteStatus> {
  const config = getConfig();
  const local: RemoteStatus = {
    loggedIn: !!config.token,
    email: config.email,
    tier: config.tier,
    hasByok: !!config.byok_key,
    source: 'local',
  };

  if (!config.token) return local;

  try {
    const resp = await fetch('https://upgpt.ai/api/v1/licenses/auth/status', {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return { ...local, source: 'local' };

    const data = (await resp.json()) as {
      loggedIn: boolean;
      email?: string;
      tier?: string;
      license_key?: string | null;
      credits_remaining?: number;
      expires_at?: string | null;
    };

    return {
      loggedIn: data.loggedIn,
      email: data.email ?? config.email,
      tier: data.tier ?? config.tier,
      license_key: data.license_key,
      credits_remaining: data.credits_remaining,
      expires_at: data.expires_at,
      hasByok: !!config.byok_key,
      source: 'remote',
    };
  } catch {
    // Offline fallback — return local config
    return { ...local, source: 'local' };
  }
}
