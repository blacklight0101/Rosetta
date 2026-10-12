import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScryptPasswordHasher } from '../../../../src/infrastructure/security/scrypt-password-hasher.js';
import { createDummyHash } from '../../../../src/infrastructure/security/dummy-password-hash.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import { timedAsync } from '../../../support/stopwatch.js';
import { addUser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1100: given a wrong user name or password, the response time is the same whether or not the
// user exists. With the real scrypt hasher (smaller parameters so the test stays quick), the median
// time of a refused sign-in for an unknown user name stays within a statistical bound of the median
// for a known name with a wrong password. Without the dummy hash an unknown name would answer in a
// fraction of the time and fail the bound.

const samples = 15;
const parameters = { cost: 2 ** 14, blockSize: 8, parallelization: 1 } as const;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

let test: TestServer;

beforeAll(async () => {
  const hasher = new ScryptPasswordHasher({ parameters });
  test = createTestServer({ hasher, dummyHash: await createDummyHash(hasher) });
  await addUser(test, { userName: 'amy' });
});

afterAll(async () => {
  await test.server.close();
});

async function timeSignIn(userName: string, index: number): Promise<number> {
  const browser = new TestBrowser(test.server);
  const { result, ms } = await timedAsync(() =>
    browser.signIn(userName, fixturePassword('Wrong'), {
      remoteAddress: `198.51.100.${String(index + 1)}`,
    }),
  );
  expect(result.statusCode).toBe(401);
  return ms;
}

describe('sign-in timing', () => {
  it('RF-1100 an unknown user name takes as long as a wrong password for a known one', async () => {
    const known: number[] = [];
    const unknown: number[] = [];
    // Interleaved, so a slow moment of the machine hits both series alike; different addresses
    // keep the rate limit out of the measurement. amy locks after five failures, and a locked
    // account still verifies the password, so its timing does not change.
    for (let index = 0; index < samples; index += 1) {
      known.push(await timeSignIn('amy', index));
      unknown.push(await timeSignIn(`nobody${String(index)}`, index + samples));
    }

    const knownMedian = median(known);
    const unknownMedian = median(unknown);

    expect(Math.abs(knownMedian - unknownMedian)).toBeLessThan(
      0.5 * Math.max(knownMedian, unknownMedian),
    );
  }, 60_000);
});
