import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  ScryptPasswordHasher,
  type DeriveKey,
} from '../../../../src/infrastructure/security/scrypt-password-hasher.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import { failureOf } from '../../../support/failure-of.js';

// RF-1100, ADR-015: only the scrypt hash with its salt and parameters is stored, in the form
// scrypt$N$r$p$salt$hash (base64); N = 2^17, r = 8, p = 1, a 16-byte salt and a 64-byte key;
// compared in constant time; maxmem 256 MiB and at most two hashes at a time (DEC-112).

/** Cheaper parameters for the tests that do not check the defaults. */
const fast = { cost: 2 ** 14, blockSize: 8, parallelization: 1 } as const;
const base64 = /^[A-Za-z0-9+/]+={0,2}$/;

describe('ScryptPasswordHasher', () => {
  it('RF-1100 stores only the scrypt hash with its salt and the ADR-015 parameters', async () => {
    const password = fixturePassword('Hash');

    const stored = await new ScryptPasswordHasher().hash(password);
    const [scheme, cost, blockSize, parallelization, salt = '', key = ''] = stored.split('$');

    expect([scheme, cost, blockSize, parallelization]).toEqual(['scrypt', '131072', '8', '1']);
    expect(salt).toMatch(base64);
    expect(key).toMatch(base64);
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(key, 'base64')).toHaveLength(64);
    expect(stored).not.toContain(password);
  });

  it('RF-1100 verifies the right password and refuses a wrong one', async () => {
    const hasher = new ScryptPasswordHasher({ parameters: fast });
    const password = fixturePassword('Verify');
    const stored = await hasher.hash(password);

    expect(await hasher.verify(password, stored)).toBe(true);
    expect(await hasher.verify(fixturePassword('Other'), stored)).toBe(false);
  });

  it('RF-1100 uses a new salt for every hash', async () => {
    const hasher = new ScryptPasswordHasher({ parameters: fast });
    const password = fixturePassword('Salt');

    const first = await hasher.hash(password);
    const second = await hasher.hash(password);

    expect(first).not.toBe(second);
  });

  it('ADR-015 verifies with the parameters stored in the hash, so they can be raised later', async () => {
    const password = fixturePassword('Params');
    const older = await new ScryptPasswordHasher({ parameters: fast }).hash(password);

    expect(await new ScryptPasswordHasher().verify(password, older)).toBe(true);
  });

  it.each([
    ['another scheme', 'bcrypt$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaGhhc2hoYXNoaGFzaA=='],
    ['a missing part', 'scrypt$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA=='],
    ['a cost that is not a power of two', 'scrypt$1000$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaA=='],
    ['a cost above the memory limit', 'scrypt$1048576$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaA=='],
    ['a key that is too short', 'scrypt$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaA=='],
    ['text that is not base64', 'scrypt$16384$8$1$not*base64$aGFzaGhhc2hoYXNoaGFzaA=='],
  ])('RF-1100 refuses a stored hash with %s (RST-2209)', async (_case, stored) => {
    const hasher = new ScryptPasswordHasher({ parameters: fast });

    const failure = await failureOf(hasher.verify(fixturePassword('Bad'), stored));

    expect(failure).toBeInstanceOf(RosettaError);
    expect(failure).toMatchObject({ code: ERROR_CODES.passwordHashInvalid });
    expect(JSON.stringify(failure)).not.toContain(stored);
  });

  it('DEC-112 runs at most two hashes at a time, with maxmem 256 MiB', async () => {
    let running = 0;
    let highest = 0;
    const maxmems: number[] = [];
    const derive: DeriveKey = async (_password, _salt, keyLength, options) => {
      running += 1;
      highest = Math.max(highest, running);
      maxmems.push(options.maxmem);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return Buffer.alloc(keyLength, 1);
    };
    const hasher = new ScryptPasswordHasher({ derive });

    const passwords = ['A', 'B', 'C', 'D', 'E'].map(fixturePassword);
    await Promise.all(passwords.map((password) => hasher.hash(password)));

    expect(highest).toBe(2);
    expect(maxmems).toEqual(Array.from({ length: 5 }, () => 256 * 1024 * 1024));
  });
});
