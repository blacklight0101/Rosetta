import type { ERROR_CODES } from '../../domain/errors/codes.js';
import type { Result } from '../../domain/errors/result.js';

// Architecture section 7, RF-1104, ADR-015: seals and opens provider keys. A sealed value names the
// key version that sealed it (a fingerprint, never the key); the box opens values under the current
// key and, during a rotation, under the previous one. The additional data binds a value to its row
// (`user_id:provider`), so a value moved to another row, or any changed byte, does not open.

export interface SealedSecret {
  readonly ciphertext: Uint8Array;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
  readonly keyVersion: string;
}

export type SecretUnreadable = typeof ERROR_CODES.providerKeyUnreadable;

export interface SecretBox {
  /** The version of the current key; every new value is sealed under it. */
  readonly keyVersion: string;
  /** True when the box holds the key of this version (current or previous). */
  knows(keyVersion: string): boolean;
  seal(plaintext: string, additionalData: string): SealedSecret;
  /** The plaintext, or RST-2300 when the version is unknown or the value does not open. */
  open(sealed: SealedSecret, additionalData: string): Result<string, SecretUnreadable>;
}
