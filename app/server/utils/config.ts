import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';

interface AppConfig {
  username: string;
  motherduck_token: string;
}

function getConfigPath(): string {
  const dataDir = resolve(process.cwd(), '..', 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  return resolve(dataDir, 'config.json');
}

export function getConfig(): AppConfig | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveConfig(config: AppConfig): void {
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function getMotherDuckToken(): string | null {
  // Env var takes precedence
  if (process.env.MOTHERDUCK_NOTEBOOK_RC) {
    return process.env.MOTHERDUCK_NOTEBOOK_RC;
  }
  // Fall back to config file
  const config = getConfig();
  return config?.motherduck_token || null;
}

export function getUsername(): string | null {
  const config = getConfig();
  return config?.username || null;
}

export function isConfigured(): boolean {
  return !!getMotherDuckToken();
}

export function generateUserId(username: string, token: string): string {
  return createHash('md5').update(`${username}||${token}`).digest('hex');
}

export function getUserId(): string | null {
  const config = getConfig();
  if (!config?.username || !config?.motherduck_token) return null;
  return generateUserId(config.username, config.motherduck_token);
}
