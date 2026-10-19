import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { loadEnvironment } from '../../../../src/infrastructure/config/environment.js';
import { fixtureSecret } from '../../../support/provider-key-fixtures.js';

// Fake values for tests only; none of them is a real credential.
const VARIABLE = 'ROSETTA_UPLOAD_MAX_MB';

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

describe('environment: the upload limit (RF-129, DEC-149)', () => {
  it('RF-129 defaults the upload limit to 500 MB when the variable is unset', () => {
    expect(loadEnvironment(validSource()).uploadMaxMb).toBe(500);
  });

  it.each(['1', '100', '500'])('RF-129 accepts %s MB', (value) => {
    expect(loadEnvironment(validSource({ [VARIABLE]: value })).uploadMaxMb).toBe(Number(value));
  });

  it.each(['', '0', '501', '-1', '1.5', 'abc', ' 5', '1e2'])(
    'RF-129 refuses %j at start-up with RST-1000 naming the variable',
    (value) => {
      const failure = failureOf(validSource({ [VARIABLE]: value }));

      expect(failure.code).toBe(ERROR_CODES.configurationInvalid);
      expect(failure.message).toContain(VARIABLE);
    },
  );

  it('RF-129 never prints the refused value', () => {
    expect(failureOf(validSource({ [VARIABLE]: 'secret-looking' })).message).not.toContain(
      'secret-looking',
    );
  });
});
