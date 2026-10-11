import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';

// RNF-003: the secret patterns of the P1-04 card, defined here because the masker has not
// landed yet. When P1-04 lands, this list is replaced by SecretMasker and its counts per kind.
const SECRET_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['connection-string password', /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i],
  ['sk- key', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['sk-ant- key', /\bsk-ant-[A-Za-z0-9_-]{16,}/],
  ['ghp_ token', /\bghp_[A-Za-z0-9]{20,}/],
  ['github_pat_ token', /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['AKIA key', /\bAKIA[0-9A-Z]{16}\b/],
  ['bearer token', /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['password= setting', /\b(?:password|pwd)\s*=\s*[^\s;'"]+/i],
];

// Fake samples built by concatenation so that this file holds no complete key-shaped literal.
const POSITIVE_SAMPLES: readonly (readonly [string, string])[] = [
  ['connection-string password', 'postgres://user:hunter2@host/db'],
  ['sk- key', 'sk-' + 'a'.repeat(24)],
  ['sk-ant- key', 'sk-ant-' + 'a'.repeat(24)],
  ['ghp_ token', 'ghp_' + 'a'.repeat(30)],
  ['github_pat_ token', 'github_pat_' + 'a'.repeat(30)],
  ['AKIA key', 'AKIA' + 'A'.repeat(16)],
  ['bearer token', 'Authorization: Bearer ' + 'a'.repeat(20)],
  ['private key block', '-----BEGIN RSA PRIVATE KEY-----'],
  ['password= setting', 'Server=h;Password=hunter2;'],
];

const VARIABLES = [
  'DATABASE_URL',
  'DATABASE_MIGRATOR_URL',
  'ROSETTA_SECRET_KEY',
  'ROSETTA_SECRET_KEY_PREVIOUS',
  'ROSETTA_PUBLIC_URL',
  'ROSETTA_DATA_DIR',
  'ROSETTA_ADMIN_USER',
  'ROSETTA_ADMIN_PASSWORD',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ROSETTA_OLLAMA_URL',
  'ROSETTA_CONTACT_EMAIL',
  'ROSETTA_LOG_LEVEL',
  'ROSETTA_LOG_RETENTION_DAYS',
  'GITHUB_TOKEN',
  'ROSETTA_TRUST_PROXY',
  'ROSETTA_APP_DB_PASSWORD',
  'ROSETTA_MIGRATOR_DB_PASSWORD',
  'ROSETTA_TEST',
  'ROSETTA_TEST_DATABASE_URL',
  'ROSETTA_GALLERY',
];

function parseDotenv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match?.[1] !== undefined) values[match[1]] = match[2] ?? '';
  }
  return values;
}

async function readExample(): Promise<string> {
  return readFile(new URL('../../../.env.example', import.meta.url), 'utf8');
}

describe('.env.example', () => {
  it.each(POSITIVE_SAMPLES)('RNF-003 the %s pattern matches its own sample', (kind, sample) => {
    const pattern = SECRET_PATTERNS.find(([name]) => name === kind)?.[1];

    expect(pattern?.test(sample)).toBe(true);
  });

  it('RF-1305 lists every variable of the configuration table', async () => {
    const values = parseDotenv(await readExample());

    expect(Object.keys(values).sort()).toEqual([...VARIABLES].sort());
  });

  it('RF-1305 puts a comment line above every variable', async () => {
    const lines = (await readExample()).split(/\r?\n/);

    const uncommented = lines.filter(
      (line, index) => /^[A-Z][A-Z0-9_]*=/.test(line) && lines[index - 1]?.startsWith('#') !== true,
    );

    expect(uncommented).toEqual([]);
  });

  it('RF-1305 parses successfully with the configuration schema', async () => {
    const values = parseDotenv(await readExample());

    expect(() => loadEnvironment(values)).not.toThrow();
  });

  it('RF-1305 RNF-003 contains no value matching a secret pattern', async () => {
    const text = await readExample();

    const matched = SECRET_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
      ([kind]) => kind,
    );

    expect(matched).toEqual([]);
  });
});
