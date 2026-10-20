import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { loadEnvironment } from '../../../../src/infrastructure/config/environment.js';
import { fixtureSecret } from '../../../support/provider-key-fixtures.js';

// P3-44: the three workbook limits are settings validated at start-up like ROSETTA_UPLOAD_MAX_MB.

type Source = Record<string, string | undefined>;

function validSource(overrides: Source = {}): Source {
  return {
    DATABASE_URL: 'postgres://rosetta_app@127.0.0.1:5432/rosetta',
    ROSETTA_SECRET_KEY: fixtureSecret(7),
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

const SETTINGS = [
  {
    variable: 'ROSETTA_WORKBOOK_MAX_FILES',
    key: 'workbookMaxFiles',
    fallback: 20,
    low: 1,
    high: 100,
  },
  {
    variable: 'ROSETTA_WORKBOOK_MAX_SHEETS',
    key: 'workbookMaxSheets',
    fallback: 200,
    low: 1,
    high: 1000,
  },
  {
    variable: 'ROSETTA_WORKBOOK_MAX_CELLS',
    key: 'workbookMaxCells',
    fallback: 2_000_000,
    low: 1000,
    high: 10_000_000,
  },
] as const;

describe.each(SETTINGS)('environment: $variable (RF-151, Q-32)', (setting) => {
  it(`RF-151 defaults to ${String(setting.fallback)} when the variable is unset`, () => {
    expect(loadEnvironment(validSource())[setting.key]).toBe(setting.fallback);
  });

  it('RF-151 accepts both ends of its range', () => {
    const low = loadEnvironment(validSource({ [setting.variable]: String(setting.low) }));
    const high = loadEnvironment(validSource({ [setting.variable]: String(setting.high) }));

    expect([low[setting.key], high[setting.key]]).toEqual([setting.low, setting.high]);
  });

  it.each(['0', '-1', 'abc', '1.5', '1e2', ' 5'])(
    'RF-151 refuses %j at start-up with RST-1000 naming the variable',
    (value) => {
      const failure = failureOf(validSource({ [setting.variable]: value }));

      expect(failure.code).toBe(ERROR_CODES.configurationInvalid);
      expect(failure.message).toContain(setting.variable);
    },
  );

  it('RF-151 refuses one above its range', () => {
    const failure = failureOf(validSource({ [setting.variable]: String(setting.high + 1) }));

    expect(failure.code).toBe(ERROR_CODES.configurationInvalid);
    expect(failure.message).toContain(setting.variable);
  });

  it('RF-151 refuses one below its range', () => {
    const failure = failureOf(validSource({ [setting.variable]: String(setting.low - 1) }));

    expect(failure.message).toContain(setting.variable);
  });

  it('RF-151 treats an empty value as unset, because Compose passes unset variables as ""', () => {
    expect(loadEnvironment(validSource({ [setting.variable]: '' }))[setting.key]).toBe(
      setting.fallback,
    );
  });
});
