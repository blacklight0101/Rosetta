import type { SealedSecret } from '../../src/application/ports/secret-box.js';
import type { ProviderKeyRecord } from '../../src/application/ports/provider-key-repository.js';
import type { KeyProvider } from '../../src/domain/accounts/provider-keys.js';

// FAKE SECRETS ONLY (RNF-003, data-model.md section 8). Every provider key and server secret below
// is built at run time from harmless pieces, so the repository holds no key-like literal (no
// provider prefix, no cloud key shape) and none of them was ever a credential. The output scan
// tests check that no full fixture key reaches a response, a log entry or an audit row.

/** A fixture provider key of 30 or more visible characters; the tag ends it, so last4 differ. */
export function fixtureKey(tag: string): string {
  return ['fixture', 'provider', 'key', 'Zq9Wm4', tag].join('_');
}

/** A server secret: 32 bytes of one value, as base64 (ROSETTA_SECRET_KEY form). */
export function fixtureSecret(fill: number): string {
  return Buffer.alloc(32, fill).toString('base64');
}

/** Hexadecimal of bytes, so tests compare stored bytes whatever their class. */
export function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

/** A sealed value with recognisable bytes, for repository tests that need no real encryption. */
export function sampleSealed(fill: number, keyVersion: string): SealedSecret {
  return {
    ciphertext: Buffer.alloc(24, fill),
    iv: Buffer.alloc(12, fill + 1),
    authTag: Buffer.alloc(16, fill + 2),
    keyVersion,
  };
}

/** A stored key row; a test overrides what it needs. */
export function sampleKeyRecord(
  userId: string,
  provider: KeyProvider,
  overrides: Partial<ProviderKeyRecord> = {},
): ProviderKeyRecord {
  const at = new Date('2026-10-11T09:00:00.000Z');
  return {
    userId,
    provider,
    baseUrl: provider === 'openai-compatible' ? 'https://llm.example.com/v1' : null,
    sealed: sampleSealed(1, 'version-a'),
    last4: 'AbC1',
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

/** A record with its bytes as hexadecimal, for comparisons across adapters. */
export function plainRecord(record: ProviderKeyRecord | undefined): unknown {
  if (record === undefined) return undefined;
  const { sealed, ...rest } = record;
  return {
    ...rest,
    sealed: {
      ciphertext: hex(sealed.ciphertext),
      iv: hex(sealed.iv),
      authTag: hex(sealed.authTag),
      keyVersion: sealed.keyVersion,
    },
  };
}
