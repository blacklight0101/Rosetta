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
    expect(failureOf(validSource({ ROSETTA_GALLERY: 'true' })).message).toContain(
      'ROSETTA_GALLERY',
    );
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
