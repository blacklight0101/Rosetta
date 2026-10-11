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
