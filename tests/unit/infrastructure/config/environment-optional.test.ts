import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { loadEnvironment } from '../../../../src/infrastructure/config/environment.js';

// Fake values for tests only; none of them is a real credential.
const FAKE_KEY = Buffer.alloc(32, 7).toString('base64');

type Source = Record<string, string | undefined>;

function validSource(overrides: Source = {}): Source {
  return {
    DATABASE_URL: 'postgres://rosetta_app@127.0.0.1:5432/rosetta',
    ROSETTA_SECRET_KEY: FAKE_KEY,
    ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
    ROSETTA_DATA_DIR: '/data',
    ...overrides,
  };
}

function failureOf(source: Source): RosettaError {
  try {
    loadEnvironment(source);
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('expected loadEnvironment to throw');
}

describe('environment: optional values and defaults', () => {
  it('RF-1305 applies the documented defaults', () => {
    const environment = loadEnvironment(validSource());

    expect(environment.logLevel).toBe('info');
    expect(environment.logRetentionDays).toBe(14);
    expect(environment.trustProxy).toBe(0);
    expect(environment.test).toBe(false);
    expect(environment).not.toHaveProperty('gallery');
    expect(environment.openaiApiKey).toBeUndefined();
    expect(environment.anthropicApiKey).toBeUndefined();
    expect(environment.githubToken).toBeUndefined();
    expect(environment.adminUser).toBeUndefined();
    expect(environment.adminPassword).toBeUndefined();
    expect(environment.ollamaUrl).toBeUndefined();
    expect(environment.contactEmail).toBeUndefined();
  });

  it('RF-1305 reads the optional server keys, administrator and contact settings', () => {
    const environment = loadEnvironment(
      validSource({
        OPENAI_API_KEY: 'fake-openai-key',
        ANTHROPIC_API_KEY: 'fake-anthropic-key',
        GITHUB_TOKEN: 'fake-github-token',
        ROSETTA_ADMIN_USER: 'admin',
        ROSETTA_ADMIN_PASSWORD: 'fake-admin-secret',
        ROSETTA_OLLAMA_URL: 'http://host.docker.internal:11434',
        ROSETTA_CONTACT_EMAIL: 'contact@example.com',
        ROSETTA_APP_DB_PASSWORD: 'fake-app-db',
        ROSETTA_MIGRATOR_DB_PASSWORD: 'fake-migrator-db',
        ROSETTA_DB_ADMIN_PASSWORD: 'fake-db-admin',
      }),
    );

    expect(environment.openaiApiKey).toBe('fake-openai-key');
    expect(environment.anthropicApiKey).toBe('fake-anthropic-key');
    expect(environment.githubToken).toBe('fake-github-token');
    expect(environment.adminUser).toBe('admin');
    expect(environment.adminPassword).toBe('fake-admin-secret');
    expect(environment.ollamaUrl).toBe('http://host.docker.internal:11434');
    expect(environment.contactEmail).toBe('contact@example.com');
    expect(environment.appDbPassword).toBe('fake-app-db');
    expect(environment.migratorDbPassword).toBe('fake-migrator-db');
    expect(environment.dbAdminPassword).toBe('fake-db-admin');
  });
});

describe('environment: log level, retention, proxy and URLs', () => {
  it.each(['debug', 'info', 'warn', 'error'])('RF-1305 accepts log level %s', (level) => {
    expect(loadEnvironment(validSource({ ROSETTA_LOG_LEVEL: level })).logLevel).toBe(level);
  });

  it('RF-1305 rejects an unknown log level', () => {
    expect(failureOf(validSource({ ROSETTA_LOG_LEVEL: 'loud' })).message).toContain(
      'ROSETTA_LOG_LEVEL',
    );
  });

  it('RF-1305 reads the log retention as a positive whole number of days', () => {
    expect(
      loadEnvironment(validSource({ ROSETTA_LOG_RETENTION_DAYS: '30' })).logRetentionDays,
    ).toBe(30);
    for (const value of ['0', '-1', '1.5', 'many']) {
      expect(failureOf(validSource({ ROSETTA_LOG_RETENTION_DAYS: value })).message).toContain(
        'ROSETTA_LOG_RETENTION_DAYS',
      );
    }
  });

  it('RF-1305 reads ROSETTA_TRUST_PROXY as a hop count that defaults to 0', () => {
    expect(loadEnvironment(validSource({ ROSETTA_TRUST_PROXY: '1' })).trustProxy).toBe(1);
    expect(loadEnvironment(validSource({ ROSETTA_TRUST_PROXY: '0' })).trustProxy).toBe(0);
    for (const value of ['-1', '1.5', 'true', '99999']) {
      expect(failureOf(validSource({ ROSETTA_TRUST_PROXY: value })).message).toContain(
        'ROSETTA_TRUST_PROXY',
      );
    }
  });

  it('RF-1305 rejects a malformed Ollama URL or contact address', () => {
    expect(failureOf(validSource({ ROSETTA_OLLAMA_URL: 'localhost' })).message).toContain(
      'ROSETTA_OLLAMA_URL',
    );
    expect(failureOf(validSource({ ROSETTA_CONTACT_EMAIL: 'not-an-email' })).message).toContain(
      'ROSETTA_CONTACT_EMAIL',
    );
  });
});

describe('environment: the Ollama URL', () => {
  const fakePass = ['fake', 'pass'].join('-');

  it('RF-401 refuses an Ollama URL with userinfo with RST-1000 and never echoes it', () => {
    for (const url of [
      `http://user:${fakePass}@127.0.0.1:11434`,
      'http://user@127.0.0.1:11434',
      `https://:${fakePass}@ollama.example.test`,
    ]) {
      const error = failureOf(validSource({ ROSETTA_OLLAMA_URL: url }));

      expect(error.code).toBe(ERROR_CODES.configurationInvalid);
      expect(error.message).toContain('ROSETTA_OLLAMA_URL');
      expect(error.message).not.toContain(fakePass);
    }
  });
});
