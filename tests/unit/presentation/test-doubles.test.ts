import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { TestDoubles } from '../../../src/presentation/test-doubles.js';

// RNF-005, ADR-008, DEC-112: the fake GitHub and the fake provider reach the composition root only
// through a factory that exists in test mode. A real deployment (no ROSETTA_TEST=1) is refused,
// both when the doubles are made and when they are composed.

const secretKey = Buffer.alloc(32, 5).toString('base64');
const baseEnvironment = {
  DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none',
  ROSETTA_SECRET_KEY: secretKey,
  ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
  ROSETTA_DATA_DIR: 'unused',
};
const testMode = loadEnvironment({ ...baseEnvironment, ROSETTA_TEST: '1' });
const production = loadEnvironment(baseEnvironment);
const fetchNothing = (): Promise<Response> => Promise.resolve(new Response(null, { status: 404 }));

describe('test doubles', () => {
  it('RNF-005 makes the doubles when ROSETTA_TEST is 1', () => {
    const doubles = TestDoubles.create(testMode, { fetch: fetchNothing });

    expect(doubles.fetch).toBe(fetchNothing);
    expect(doubles.provider).toBeUndefined();
  });

  it('RNF-005 refuses to make the doubles when ROSETTA_TEST is not set', () => {
    const attempt = (): TestDoubles => TestDoubles.create(production, { fetch: fetchNothing });

    expect(attempt).toThrow(RosettaError);
    expect(attempt).toThrow(expect.objectContaining({ code: ERROR_CODES.fakeProviderRefused }));
  });

  it('RNF-005 refuses to compose doubles with an environment that is not in test mode', () => {
    const doubles = TestDoubles.create(testMode, { fetch: fetchNothing });

    const attempt = (): unknown =>
      composeApplication({
        environment: production,
        listen: { host: '127.0.0.1', port: 0 },
        output: { write: () => true },
        doubles,
      });

    expect(attempt).toThrow(expect.objectContaining({ code: ERROR_CODES.fakeProviderRefused }));
  });

  it('RNF-014 the environment refuses ROSETTA_TEST when the public URL is https', () => {
    const attempt = (): unknown =>
      loadEnvironment({
        ...baseEnvironment,
        ROSETTA_PUBLIC_URL: 'https://rosetta.example.org',
        ROSETTA_TEST: '1',
      });

    expect(attempt).toThrow(/ROSETTA_TEST is refused/);
  });
});
