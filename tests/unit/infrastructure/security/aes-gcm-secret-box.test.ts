import { createCipheriv, createHash, hkdf } from 'node:crypto';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { AesGcmSecretBox } from '../../../../src/infrastructure/security/aes-gcm-secret-box.js';
import type { SealedSecret } from '../../../../src/application/ports/secret-box.js';
import { fixtureKey, fixtureSecret, hex } from '../../../support/provider-key-fixtures.js';

// RF-1104, ADR-015, DEC-112: provider keys are sealed with AES-256-GCM under a key derived from
// ROSETTA_SECRET_KEY with HKDF-SHA256 (info `rosetta/provider-keys/v1`), a random 96-bit IV per
// value and the additional data `user_id:provider`; `key_version` is a fingerprint of the derived
// key. A changed byte, other additional data or an unknown key version never opens.

const amy = '00000000-0000-4000-9000-0000000000a1';
const bob = '00000000-0000-4000-9000-0000000000b2';
const amyOpenAi = `${amy}:openai`;
const unreadable = { ok: false, error: ERROR_CODES.providerKeyUnreadable };

/** The documented derivation, computed here with the asynchronous HKDF of node:crypto. */
async function derived(secret: string): Promise<Buffer> {
  const info = 'rosetta/provider-keys/v1';
  const ikm = Buffer.from(secret, 'base64');
  return Buffer.from(await promisify(hkdf)('sha256', ikm, Buffer.alloc(0), info, 32));
}

/** The error a secret box refuses to build with, or undefined when it builds. */
function refusalOf(secret: string): unknown {
  try {
    new AesGcmSecretBox({ current: secret });
  } catch (error) {
    return error;
  }
  return undefined;
}

function flipped(bytes: Uint8Array, index = 0): Buffer {
  const copy = Buffer.from(bytes);
  copy[index] = (copy[index] ?? 0) ^ 0x01;
  return copy;
}

describe('AesGcmSecretBox', () => {
  it('RF-1104 seals and opens a key with the same additional data', () => {
    const box = new AesGcmSecretBox({ current: fixtureSecret(1) });
    const key = fixtureKey('RoundTrip1');

    const sealed = box.seal(key, amyOpenAi);

    expect(box.open(sealed, amyOpenAi)).toEqual({ ok: true, value: key });
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.authTag).toHaveLength(16);
    expect(Buffer.from(sealed.ciphertext).toString('latin1')).not.toContain(key.slice(0, 8));
  });

  it('RF-1104 uses a fresh random IV for every value', () => {
    const box = new AesGcmSecretBox({ current: fixtureSecret(1) });
    const key = fixtureKey('SameValue1');

    const first = box.seal(key, amyOpenAi);
    const second = box.seal(key, amyOpenAi);

    expect(hex(first.iv)).not.toBe(hex(second.iv));
    expect(hex(first.ciphertext)).not.toBe(hex(second.ciphertext));
  });
});

describe('AesGcmSecretBox key derivation', () => {
  it('RF-1104 derives the AES key with HKDF-SHA256 and the documented info', async () => {
    const secret = fixtureSecret(2);
    const box = new AesGcmSecretBox({ current: secret });
    const iv = Buffer.alloc(12, 5);
    const cipher = createCipheriv('aes-256-gcm', await derived(secret), iv, { authTagLength: 16 });
    cipher.setAAD(Buffer.from(amyOpenAi, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update('outside-sealed-value', 'utf8'),
      cipher.final(),
    ]);
    const sealed = { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: box.keyVersion };

    expect(box.open(sealed, amyOpenAi)).toEqual({ ok: true, value: 'outside-sealed-value' });
  });

  it('RF-1104 the key version is a fingerprint, never the secret or the derived key', async () => {
    const secret = fixtureSecret(3);
    const key = await derived(secret);
    const box = new AesGcmSecretBox({ current: secret });

    expect(box.keyVersion).toBe(createHash('sha256').update(key).digest('hex').slice(0, 16));
    for (const form of [secret, key.toString('hex'), key.toString('base64')]) {
      expect(form).not.toContain(box.keyVersion);
    }
    expect(new AesGcmSecretBox({ current: fixtureSecret(4) }).keyVersion).not.toBe(box.keyVersion);
  });
});

describe('AesGcmSecretBox refusals', () => {
  it('RF-1104 a value refuses to open under another user or another provider', () => {
    const box = new AesGcmSecretBox({ current: fixtureSecret(1) });
    const sealed = box.seal(fixtureKey('Swap1'), amyOpenAi);

    expect(box.open(sealed, `${bob}:openai`)).toEqual(unreadable);
    expect(box.open(sealed, `${amy}:anthropic`)).toEqual(unreadable);
  });

  it('RF-1104 a ciphertext swapped between two rows refuses to open', () => {
    const box = new AesGcmSecretBox({ current: fixtureSecret(1) });
    const amys = box.seal(fixtureKey('AmyKey1'), amyOpenAi);
    const bobs = box.seal(fixtureKey('BobKey1'), `${bob}:openai`);

    expect(box.open(bobs, amyOpenAi)).toEqual(unreadable);
    expect(box.open({ ...amys, ciphertext: bobs.ciphertext }, amyOpenAi)).toEqual(unreadable);
  });

  it.each(['ciphertext', 'iv', 'authTag'] as const)(
    'RF-1104 detects a changed byte in the %s',
    (part) => {
      const box = new AesGcmSecretBox({ current: fixtureSecret(1) });
      const sealed = box.seal(fixtureKey('Tamper1'), amyOpenAi);
      const tampered: SealedSecret = { ...sealed, [part]: flipped(sealed[part], 3) };

      expect(box.open(tampered, amyOpenAi)).toEqual(unreadable);
    },
  );

  it('RF-1104 refuses a shortened authentication tag or IV', () => {
    const box = new AesGcmSecretBox({ current: fixtureSecret(1) });
    const sealed = box.seal(fixtureKey('Short1'), amyOpenAi);

    expect(box.open({ ...sealed, authTag: sealed.authTag.subarray(0, 4) }, amyOpenAi)).toEqual(
      unreadable,
    );
    expect(box.open({ ...sealed, iv: sealed.iv.subarray(0, 8) }, amyOpenAi)).toEqual(unreadable);
  });
});

describe('AesGcmSecretBox rotation', () => {
  it('RF-1104 opens a value sealed under ROSETTA_SECRET_KEY_PREVIOUS and seals new ones under the current key', () => {
    const old = new AesGcmSecretBox({ current: fixtureSecret(10) });
    const sealedOld = old.seal(fixtureKey('Rotate1'), amyOpenAi);
    const box = new AesGcmSecretBox({ current: fixtureSecret(11), previous: fixtureSecret(10) });

    const resealed = box.seal(fixtureKey('Rotate1'), amyOpenAi);

    expect(box.open(sealedOld, amyOpenAi)).toEqual({ ok: true, value: fixtureKey('Rotate1') });
    expect(sealedOld.keyVersion).toBe(old.keyVersion);
    expect(resealed.keyVersion).toBe(box.keyVersion);
    expect(box.keyVersion).not.toBe(old.keyVersion);
    expect(box.knows(old.keyVersion)).toBe(true);
  });

  it('RF-1104 refuses a value under a key version it does not hold', () => {
    const stranger = new AesGcmSecretBox({ current: fixtureSecret(12) });
    const box = new AesGcmSecretBox({ current: fixtureSecret(11), previous: fixtureSecret(10) });
    const sealed = stranger.seal(fixtureKey('Unknown1'), amyOpenAi);

    expect(box.open(sealed, amyOpenAi)).toEqual(unreadable);
    expect(box.knows(stranger.keyVersion)).toBe(false);
    expect(box.open({ ...sealed, keyVersion: box.keyVersion }, amyOpenAi)).toEqual(unreadable);
  });

  it.each([
    [
      'a character outside the base64 alphabet',
      (valid: string) => `${valid.slice(0, 10)}*${valid.slice(10)}`,
    ],
    ['a line break', (valid: string) => `${valid}\n`],
    [
      'a non-canonical ending, whose unused bits are not zero',
      (valid: string) => `${valid.slice(0, -2)}B=`,
    ],
  ])('RF-1104 refuses a server secret with %s, without naming its value', (_case, change) => {
    const valid = fixtureSecret(7);

    expect(refusalOf(change(valid))).toMatchObject({ code: ERROR_CODES.configurationInvalid });
  });

  it('RF-1104 refuses a server secret in the URL-safe alphabet, without naming its value', () => {
    const standard = Buffer.alloc(32, 0xff).toString('base64');
    const urlSafe = standard.replace(/\//g, '_');
    expect(urlSafe).not.toBe(standard);

    expect(refusalOf(urlSafe)).toMatchObject({ code: ERROR_CODES.configurationInvalid });
  });

  it('RF-1104 accepts the canonical base64 of 32 bytes', () => {
    expect(() => new AesGcmSecretBox({ current: fixtureSecret(7) })).not.toThrow();
  });

  it('RF-1305 refuses a server secret that is not 32 bytes, without naming its value', () => {
    const short = Buffer.alloc(16, 9).toString('base64');

    expect(() => new AesGcmSecretBox({ current: short })).toThrow(
      expect.objectContaining({ code: ERROR_CODES.configurationInvalid }),
    );
    expect(() => new AesGcmSecretBox({ current: short })).not.toThrow(short);
  });
});
