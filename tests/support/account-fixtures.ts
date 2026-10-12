import type { PasswordHasher } from '../../src/application/ports/password-hasher.js';
import type { UserAccount } from '../../src/domain/accounts/user.js';

// FAKE CREDENTIALS ONLY (RNF-003, data-model.md section 8). Every password below is built at run
// time from harmless pieces, so the repository holds no password literal and none of them was ever
// a credential. Tests check that none of them reaches a log, an audit row or a response.

/** A fresh fixture password of at least 12 characters that contains no user name used in tests. */
export function fixturePassword(tag: string): string {
  return ['Rst', tag, 'fixture', 'phrase', '2026'].join('-');
}

/**
 * A tiny common-passwords list for tests (lower case, as the password rules expect), built from
 * pieces at run time like every fixture password.
 */
export const commonPasswords: ReadonlySet<string> = new Set(
  [
    ['pass', 'word', '1234'],
    ['qwerty', 'uiop', '12'],
  ].map((pieces) => pieces.join('')),
);

/** A fixed instant (2026-10-11T09:00:00.000Z) in epoch milliseconds. */
export const fixtureNow = Date.UTC(2026, 9, 11, 9, 0, 0, 0);

/** Minutes in milliseconds, for moving a fixed instant. */
export function minutes(count: number): number {
  return count * 60_000;
}

/** Characters of the text as hexadecimal code units, so a fake hash never holds the password. */
function hexOf(text: string): string {
  return Array.from(text, (character) => (character.codePointAt(0) ?? 0).toString(16)).join('.');
}

/**
 * A deterministic stand-in for the scrypt hasher in unit tests (no randomness, no cost). It records
 * how many hashes it made.
 */
export class FakePasswordHasher implements PasswordHasher {
  hashes = 0;

  hash(password: string): Promise<string> {
    this.hashes += 1;
    return Promise.resolve(`fake$${hexOf(password)}`);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return Promise.resolve(passwordHash === `fake$${hexOf(password)}`);
  }
}

let accountCount = 0;

/** A valid account with generated values; a test overrides what it needs. */
export function sampleAccount(overrides: Partial<UserAccount> = {}): UserAccount {
  accountCount += 1;
  const number = String(accountCount).padStart(12, '0');
  return {
    id: `00000000-0000-4000-9000-${number}`,
    userName: `user.${number}`,
    displayName: 'Sample User',
    role: 'user',
    state: 'Active',
    passwordHash: `fake$hash.${number}`,
    failedSignIns: 0,
    firstFailedAt: null,
    lockedUntil: null,
    serverKeysAllowed: true,
    dailyCapMicros: null,
    ownDailyCapMicros: null,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
    lastSignInAt: null,
    ...overrides,
  };
}
