import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { loadEnvironment } from '../../../../src/infrastructure/config/environment.js';

// Fake values for tests only; none of them is a real credential.
const FAKE_KEY = Buffer.alloc(32, 7).toString('base64');
const FAKE_PREVIOUS_KEY = Buffer.alloc(32, 9).toString('base64');

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

describe('environment: the required variables', () => {
  it('RF-1305 reads the required variables from a complete environment', () => {
    const environment = loadEnvironment(validSource());

    expect(environment.databaseUrl).toBe('postgres://rosetta_app@127.0.0.1:5432/rosetta');
    expect(environment.secretKey).toBe(FAKE_KEY);
    expect(environment.publicUrl).toBe('http://127.0.0.1:8080');
    expect(environment.dataDir).toBe('/data');
  });

  it.each(['DATABASE_URL', 'ROSETTA_SECRET_KEY', 'ROSETTA_PUBLIC_URL', 'ROSETTA_DATA_DIR'])(
    'RF-1305 stops with RST-1000 naming %s when it is missing',
    (name) => {
      const error = failureOf(validSource({ [name]: undefined }));

      expect(error.code).toBe(ERROR_CODES.configurationInvalid);
      expect(error.message).toContain(name);
    },
  );

  it('RF-1305 treats an empty value as missing', () => {
    const error = failureOf(validSource({ ROSETTA_DATA_DIR: '' }));

    expect(error.message).toContain('ROSETTA_DATA_DIR');
  });

  it('RF-1305 names every missing or invalid variable in one error', () => {
    const error = failureOf({ ROSETTA_PUBLIC_URL: 'ftp://example.com', ROSETTA_LOG_LEVEL: 'loud' });

    for (const name of [
      'DATABASE_URL',
      'ROSETTA_SECRET_KEY',
      'ROSETTA_DATA_DIR',
      'ROSETTA_PUBLIC_URL',
      'ROSETTA_LOG_LEVEL',
    ]) {
      expect(error.message).toContain(name);
    }
  });
});

describe('environment: DATABASE_URL and DATABASE_MIGRATOR_URL', () => {
  it.each(['postgres://u@h/db', 'postgresql://u@h:5432/db'])('RF-1305 accepts %s', (url) => {
    expect(loadEnvironment(validSource({ DATABASE_URL: url })).databaseUrl).toBe(url);
  });

  it('RF-1305 rejects a DATABASE_URL that is not a PostgreSQL URL', () => {
    expect(failureOf(validSource({ DATABASE_URL: 'mysql://u@h/db' })).message).toContain(
      'DATABASE_URL',
    );
  });

  it('RF-1305 uses DATABASE_URL for the migrator when DATABASE_MIGRATOR_URL is absent', () => {
    const environment = loadEnvironment(validSource());

    expect(environment.databaseMigratorUrl).toBe(environment.databaseUrl);
  });

  it('RF-1305 uses DATABASE_MIGRATOR_URL when it is set and validates it', () => {
    const url = 'postgres://rosetta_migrator@127.0.0.1:5432/rosetta';

    expect(loadEnvironment(validSource({ DATABASE_MIGRATOR_URL: url })).databaseMigratorUrl).toBe(
      url,
    );
    expect(failureOf(validSource({ DATABASE_MIGRATOR_URL: 'nope' })).message).toContain(
      'DATABASE_MIGRATOR_URL',
    );
  });
});

describe('environment: ROSETTA_SECRET_KEY', () => {
  it.each([
    ['too short', Buffer.alloc(16, 1).toString('base64')],
    ['too long', Buffer.alloc(33, 1).toString('base64')],
    ['not base64', 'this is not base64 at all!!!!!!!!!!!!!!!!!!!!!!!'],
  ])('RF-1305 rejects a key that is %s', (_label, value) => {
    expect(failureOf(validSource({ ROSETTA_SECRET_KEY: value })).message).toContain(
      'ROSETTA_SECRET_KEY',
    );
  });

  it('RF-1305 validates the previous key under the same rule and keeps it optional', () => {
    expect(loadEnvironment(validSource()).secretKeyPrevious).toBeUndefined();
    expect(
      loadEnvironment(validSource({ ROSETTA_SECRET_KEY_PREVIOUS: FAKE_PREVIOUS_KEY }))
        .secretKeyPrevious,
    ).toBe(FAKE_PREVIOUS_KEY);
    expect(failureOf(validSource({ ROSETTA_SECRET_KEY_PREVIOUS: 'short' })).message).toContain(
      'ROSETTA_SECRET_KEY_PREVIOUS',
    );
  });
});

describe('environment: ROSETTA_PUBLIC_URL', () => {
  it.each(['http://127.0.0.1:8080', 'https://rosetta.example.com'])(
    'RF-1305 accepts the origin %s',
    (url) => {
      expect(loadEnvironment(validSource({ ROSETTA_PUBLIC_URL: url })).publicUrl).toBe(url);
    },
  );

  it.each([
    'ftp://example.com',
    'rosetta.example.com',
    'https://example.com/app',
    'https://example.com/',
    'https://user@example.com',
    'https://example.com?x=1',
  ])('RF-1305 rejects %s because it is not an http(s) origin', (url) => {
    expect(failureOf(validSource({ ROSETTA_PUBLIC_URL: url })).message).toContain(
      'ROSETTA_PUBLIC_URL',
    );
  });
});

describe('environment: optional values and defaults', () => {
  it('RF-1305 applies the documented defaults', () => {
    const environment = loadEnvironment(validSource());

    expect(environment.logLevel).toBe('info');
    expect(environment.logRetentionDays).toBe(14);
    expect(environment.trustProxy).toBe(0);
    expect(environment.test).toBe(false);
    expect(environment.gallery).toBe(false);
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
  });

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

describe('environment: test-only variables', () => {
  const testOnly: Record<string, string> = {
    ROSETTA_TEST: '1',
    ROSETTA_TEST_DATABASE_URL: 'postgres://rosetta_test@127.0.0.1:5433/rosetta_test',
    ROSETTA_GALLERY: '1',
  };

  it('RF-1305 accepts the test-only variables with an http public URL', () => {
    const environment = loadEnvironment(validSource(testOnly));

    expect(environment.test).toBe(true);
    expect(environment.gallery).toBe(true);
    expect(environment.testDatabaseUrl).toBe(testOnly['ROSETTA_TEST_DATABASE_URL']);
  });

  it.each(Object.keys(testOnly))('RF-1305 refuses %s when ROSETTA_PUBLIC_URL is https', (name) => {
    const error = failureOf(
      validSource({ ROSETTA_PUBLIC_URL: 'https://rosetta.example.com', [name]: testOnly[name] }),
    );

    expect(error.code).toBe(ERROR_CODES.configurationInvalid);
    expect(error.message).toContain(name);
  });

  it('RF-1305 allows an https public URL when no test-only variable is set', () => {
    const environment = loadEnvironment(
      validSource({ ROSETTA_PUBLIC_URL: 'https://rosetta.example.com' }),
    );

    expect(environment.test).toBe(false);
  });

  it('RF-1305 accepts only 1 for the ROSETTA_TEST and ROSETTA_GALLERY switches', () => {
    expect(failureOf(validSource({ ROSETTA_TEST: 'yes' })).message).toContain('ROSETTA_TEST');
    expect(failureOf(validSource({ ROSETTA_GALLERY: 'true' })).message).toContain('ROSETTA_GALLERY');
  });
});

describe('environment: the result and the error never leak a value', () => {
  it('RF-1305 returns an immutable object', () => {
    const environment = loadEnvironment(validSource());

    expect(Object.isFrozen(environment)).toBe(true);
  });

  it('RF-1305 ignores variables that are not part of the configuration', () => {
    const environment = loadEnvironment(validSource({ PATH: '/usr/bin', HOME: '/home/x' }));

    expect(Object.keys(environment)).not.toContain('PATH');
  });

  const wrongValues: readonly (readonly [string, string])[] = [
    ['DATABASE_URL', 'wrong-secret-value-database'],
    ['DATABASE_MIGRATOR_URL', 'wrong-secret-value-migrator'],
    ['ROSETTA_SECRET_KEY', 'wrong-secret-value-key'],
    ['ROSETTA_SECRET_KEY_PREVIOUS', 'wrong-secret-value-previous'],
    ['ROSETTA_PUBLIC_URL', 'wrong-secret-value-public'],
    ['ROSETTA_OLLAMA_URL', 'wrong-secret-value-ollama'],
    ['ROSETTA_CONTACT_EMAIL', 'wrong-secret-value-email'],
    ['ROSETTA_LOG_LEVEL', 'wrong-secret-value-level'],
    ['ROSETTA_LOG_RETENTION_DAYS', 'wrong-secret-value-days'],
    ['ROSETTA_TRUST_PROXY', 'wrong-secret-value-proxy'],
    ['ROSETTA_TEST', 'wrong-secret-value-test'],
    ['ROSETTA_TEST_DATABASE_URL', 'wrong-secret-value-testdb'],
    ['ROSETTA_GALLERY', 'wrong-secret-value-gallery'],
  ];

  it.each(wrongValues)('RF-1305 does not echo the wrong value of %s', (name, value) => {
    const error = failureOf(validSource({ [name]: value }));

    expect(error.message).toContain(name);
    expect(error.message).not.toContain(value);
    expect(JSON.stringify(error)).not.toContain(value);
    expect(String(error.stack)).not.toContain(value);
  });

  it('RF-1305 does not echo the value of a test-only variable refused under https', () => {
    const value = 'wrong-secret-value-refused';
    const error = failureOf(
      validSource({
        ROSETTA_PUBLIC_URL: 'https://rosetta.example.com',
        ROSETTA_TEST_DATABASE_URL: `postgres://u@h/${value}`,
      }),
    );

    expect(error.message).not.toContain(value);
  });
});
