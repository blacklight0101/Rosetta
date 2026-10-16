import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  loadEnvironment,
  loadMigrationEnvironment,
} from '../../../../src/infrastructure/config/environment.js';
import { fixtureSecret } from '../../../support/provider-key-fixtures.js';

// RF-1305, RF-1302, ADR-016 (DEC-140, P1-158; P1-49 F-02, F-19): the server holds DATABASE_URL
// only and refuses the migrator URL, which belongs to the one-off migrate step; the migrate step
// needs DATABASE_MIGRATOR_URL and never falls back to DATABASE_URL.

type Source = Record<string, string | undefined>;

// Fake values for tests only, built from pieces; none of them is a real credential.
const FAKE_PASSWORD = ['not', 'a', 'real', 'pw'].join('-');
const MIGRATOR_URL = `postgres://rosetta_migrator:${FAKE_PASSWORD}@127.0.0.1:5432/rosetta`;

function serverSource(overrides: Source = {}): Source {
  return {
    DATABASE_URL: 'postgres://rosetta_app@127.0.0.1:5432/rosetta',
    ROSETTA_SECRET_KEY: fixtureSecret(7),
    ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
    ROSETTA_DATA_DIR: '/data',
    ...overrides,
  };
}

function failureOf(action: () => unknown): RosettaError {
  try {
    action();
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('expected a RosettaError');
}

describe('server environment: no migrator credentials', () => {
  it('RF-1305 refuses DATABASE_MIGRATOR_URL and names what to change, never the value', () => {
    const failure = failureOf(() =>
      loadEnvironment(serverSource({ DATABASE_MIGRATOR_URL: MIGRATOR_URL })),
    );

    expect(failure.code).toBe(ERROR_CODES.configurationInvalid);
    expect(failure.message).toContain('DATABASE_MIGRATOR_URL');
    expect(failure.message).toContain('remove it from the server');
    expect(failure.message).toContain('migrate step');
    expect(failure.message).not.toContain(FAKE_PASSWORD);
  });

  it('RF-1305 an empty DATABASE_MIGRATOR_URL counts as unset, as Compose and .env.example pass it', () => {
    expect(() => loadEnvironment(serverSource({ DATABASE_MIGRATOR_URL: '' }))).not.toThrow();
  });

  it('RF-1305 the server environment carries no migrator URL', () => {
    const environment = loadEnvironment(serverSource());

    expect(environment).not.toHaveProperty('databaseMigratorUrl');
    expect(JSON.stringify(environment)).not.toContain('rosetta_migrator');
  });
});

describe('migrate step environment', () => {
  it('RF-1302 reads DATABASE_MIGRATOR_URL and the log level', () => {
    const environment = loadMigrationEnvironment({
      DATABASE_MIGRATOR_URL: MIGRATOR_URL,
      ROSETTA_LOG_LEVEL: 'warn',
    });

    expect(environment).toEqual({ databaseMigratorUrl: MIGRATOR_URL, logLevel: 'warn' });
  });

  it('RF-1302 logs at info when no level is set, and needs no other server variable', () => {
    expect(loadMigrationEnvironment({ DATABASE_MIGRATOR_URL: MIGRATOR_URL }).logLevel).toBe('info');
  });

  it('RF-1302 F-19 never falls back to DATABASE_URL: a missing or empty migrator URL is refused by name', () => {
    for (const value of [undefined, '']) {
      const failure = failureOf(() =>
        loadMigrationEnvironment({ DATABASE_URL: MIGRATOR_URL, DATABASE_MIGRATOR_URL: value }),
      );

      expect(failure.code).toBe(ERROR_CODES.configurationInvalid);
      expect(failure.message).toContain('DATABASE_MIGRATOR_URL is missing');
      expect(failure.message).not.toContain(FAKE_PASSWORD);
    }
  });

  it('RF-1302 refuses a migrator URL that is not a PostgreSQL URL and a bad log level', () => {
    const failure = failureOf(() =>
      loadMigrationEnvironment({
        DATABASE_MIGRATOR_URL: `mysql://rosetta_migrator:${FAKE_PASSWORD}@h/db`,
        ROSETTA_LOG_LEVEL: 'loud',
      }),
    );

    expect(failure.message).toContain('DATABASE_MIGRATOR_URL must be a postgres://');
    expect(failure.message).toContain('ROSETTA_LOG_LEVEL');
    expect(failure.message).not.toContain(FAKE_PASSWORD);
  });
});
