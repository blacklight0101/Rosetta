import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { loadEnvironment } from '../../../../src/infrastructure/config/environment.js';
import { fixtureSecret } from '../../../support/provider-key-fixtures.js';

// Fake values for tests only; none of them is a real credential.
const FAKE_KEY = fixtureSecret(7);

type Source = Record<string, string | undefined>;

const VARIABLE = 'ROSETTA_SCAN_PARSE_BUDGET_MS';

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

describe('environment: the scan parse budget (RF-110)', () => {
  it('RF-110 defaults the parse budget to two minutes', () => {
    expect(loadEnvironment(validSource()).scanParseBudgetMs).toBe(120_000);
  });

  it('RF-110 reads a changed parse budget from the variable', () => {
    expect(loadEnvironment(validSource({ [VARIABLE]: '45000' })).scanParseBudgetMs).toBe(45_000);
  });

  it('RF-110 an empty variable, as Compose passes an unset one, means the two-minute default', () => {
    expect(loadEnvironment(validSource({ [VARIABLE]: '' })).scanParseBudgetMs).toBe(120_000);
  });

  it('RF-110 accepts the stated maximum of one hour', () => {
    expect(loadEnvironment(validSource({ [VARIABLE]: '3600000' })).scanParseBudgetMs).toBe(
      3_600_000,
    );
  });

  it.each(['0', '-1', '1.5', '1e5', 'NaN', 'Infinity', '3600001', '12ms', ' 5000'])(
    'RF-110 refuses the parse budget %s at start-up with RST-1000 naming the variable',
    (value) => {
      const error = failureOf(validSource({ [VARIABLE]: value }));

      expect(error.code).toBe(ERROR_CODES.configurationInvalid);
      expect(error.message).toContain(VARIABLE);
    },
  );

  it('RF-110 does not echo a refused parse budget value', () => {
    const value = 'wrong-secret-value-budget';
    const error = failureOf(validSource({ [VARIABLE]: value }));

    expect(error.message).toContain(VARIABLE);
    expect(error.message).not.toContain(value);
    expect(JSON.stringify(error)).not.toContain(value);
  });
});
