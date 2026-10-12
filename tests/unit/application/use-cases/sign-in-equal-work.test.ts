import { describe, expect, it, vi } from 'vitest';
import { fixtureNow, fixturePassword, minutes } from '../../../support/account-fixtures.js';
import { request, signInHarness as harness } from '../../../support/sign-in-harness.js';

// RF-1100: given a wrong user name or password, the response time is the same whether or not the
// user exists. Every refusal makes one account write, like a wrong password for a known name does
// when it counts the failure; the write for an unknown, locked or disabled name changes no
// stored account.

const wrong = { password: fixturePassword('Wrong'), ...request };

describe('SignIn equal work', () => {
  it.each([
    ['an unknown user name', {}, 'nobody'],
    ['a name that is not valid', {}, 'No Body!'],
    ['a disabled account', { state: 'Disabled' }, 'amy'],
    ['a locked account', { lockedUntil: fixtureNow + minutes(10) }, 'amy'],
  ] as const)(
    'RF-1100 %s writes once like a wrong password for a known name',
    async (_case, overrides, userName) => {
      const known = await harness();
      const knownWrites = vi.spyOn(known.users, 'update');
      await known.signIn.execute({ userName: 'amy', ...wrong });

      const other = await harness(overrides);
      const before = await other.users.list();
      const otherWrites = vi.spyOn(other.users, 'update');
      const outcome = await other.signIn.execute({ userName, ...wrong });

      expect(outcome.ok).toBe(false);
      expect(knownWrites).toHaveBeenCalledTimes(1);
      expect(otherWrites).toHaveBeenCalledTimes(1);
      expect(await other.users.list()).toEqual(before);
    },
  );
});
