import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { loadEnvironment } from '../../../../src/infrastructure/config/environment.js';
import { fixtureSecret } from '../../../support/provider-key-fixtures.js';

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

describe('environment: a known or repeated secret key', () => {
  it.each([0, 1, 7, 255])(
    'RF-1305 RNF-003 refuses a key of 32 equal bytes (%i) with RST-1008',
    (fill) => {
      const value = Buffer.alloc(32, fill).toString('base64');

      const error = failureOf(validSource({ ROSETTA_SECRET_KEY: value }));

      expect(error.code).toBe(ERROR_CODES.secretKeyKnown);
      expect(error.message).toContain('ROSETTA_SECRET_KEY');
    },
  );

  it('RF-1305 RNF-003 never writes the refused key into the error', () => {
    const value = Buffer.alloc(32, 0).toString('base64');

    const error = failureOf(validSource({ ROSETTA_SECRET_KEY: value }));

    expect(error.message).not.toContain(value);
    expect(JSON.stringify(error)).not.toContain(value);
    expect(String(error.stack)).not.toContain(value);
  });
});

describe('environment: a key that is nearly repeated', () => {
  it.each([0, 31])(
    'RF-1305 accepts a key that differs from a repeated byte at position %i only',
    (position) => {
      const bytes = Buffer.alloc(32, 7);
      bytes[position] = 8;
      const value = bytes.toString('base64');

      expect(loadEnvironment(validSource({ ROSETTA_SECRET_KEY: value })).secretKey).toBe(value);
    },
  );

  it('RF-1305 accepts a key whose bytes differ', () => {
    const value = fixtureSecret(3);

    expect(loadEnvironment(validSource({ ROSETTA_SECRET_KEY: value })).secretKey).toBe(value);
  });

  it('RF-1305 still reports a malformed key as RST-1000', () => {
    const error = failureOf(validSource({ ROSETTA_SECRET_KEY: 'short' }));

    expect(error.code).toBe(ERROR_CODES.configurationInvalid);
  });

  it('RF-1305 accepts the old placeholder as the previous key, so a rotation away from it works', () => {
    const previous = Buffer.alloc(32, 0).toString('base64');

    const environment = loadEnvironment(validSource({ ROSETTA_SECRET_KEY_PREVIOUS: previous }));

    expect(environment.secretKeyPrevious).toBe(previous);
  });
});
