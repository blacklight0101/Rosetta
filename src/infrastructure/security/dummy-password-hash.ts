import { randomBytes } from 'node:crypto';
import type { PasswordHasher } from '../../application/ports/password-hasher.js';

// RF-1100: the hash that sign-in verifies for an unknown user name, so an unknown name costs the
// same scrypt derivation as a known one. It hashes 32 random bytes made at start-up and then
// forgotten, so no password ever matches it.

const DUMMY_PASSWORD_BYTES = 32;

// RF-1100
export function createDummyHash(hasher: PasswordHasher): Promise<string> {
  return hasher.hash(randomBytes(DUMMY_PASSWORD_BYTES).toString('base64'));
}
