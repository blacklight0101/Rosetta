import { describe, expect, it } from 'vitest';
import { ReEncryptProviderKeys } from '../../../../src/application/use-cases/re-encrypt-provider-keys.js';
import {
  keyAdditionalData,
  type KeyProvider,
} from '../../../../src/domain/accounts/provider-keys.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryProviderKeyRepository } from '../../../../src/infrastructure/db/memory-provider-key-repository.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { AesGcmSecretBox } from '../../../../src/infrastructure/security/aes-gcm-secret-box.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import {
  fixtureKey,
  fixtureSecret,
  plainRecord,
  sampleKeyRecord,
} from '../../../support/provider-key-fixtures.js';

// RF-1104, DEC-112: at start-up the rows sealed under ROSETTA_SECRET_KEY_PREVIOUS are re-encrypted
// under the current key. The step is idempotent (a second start changes nothing), keeps rows that
// already use the current key as they are, and reports, without dropping it, a row under a key
// version the server does not hold or one that does not open.

const amy = '00000000-0000-4000-9000-0000000000a1';
const bob = '00000000-0000-4000-9000-0000000000b2';
const oldBox = new AesGcmSecretBox({ current: fixtureSecret(10) });
const strangerBox = new AesGcmSecretBox({ current: fixtureSecret(77) });
const rotating = new AesGcmSecretBox({ current: fixtureSecret(11), previous: fixtureSecret(10) });
const currentOnly = new AesGcmSecretBox({ current: fixtureSecret(11) });

async function stored(
  keys: MemoryProviderKeyRepository,
  box: AesGcmSecretBox,
  userId: string,
  provider: KeyProvider,
): Promise<string> {
  const key = fixtureKey(`${provider}${userId.slice(-2)}`);
  const sealed = box.seal(key, keyAdditionalData(userId, provider));
  await keys.upsert(sampleKeyRecord(userId, provider, { sealed }));
  return key;
}

function setUp() {
  const clock = new FixedClock('2026-10-11T09:00:00.000Z');
  const logger = new MemoryLogger(clock, new SecretMasker());
  const keys = new MemoryProviderKeyRepository();
  const step = new ReEncryptProviderKeys({ keys, box: rotating, logger });
  return { logger, keys, step };
}

describe('ReEncryptProviderKeys', () => {
  it('RF-1104 re-encrypts every row under the previous key so the current key alone opens it', async () => {
    const { keys, step } = setUp();
    const amysKey = await stored(keys, oldBox, amy, 'openai');
    const bobsKey = await stored(keys, oldBox, bob, 'anthropic');

    const outcome = await step.execute();

    expect(outcome).toEqual({ reEncrypted: 2, unreadable: 0 });
    const amys = await keys.find(amy, 'openai');
    const bobs = await keys.find(bob, 'anthropic');
    expect(amys?.sealed.keyVersion).toBe(currentOnly.keyVersion);
    expect(amys && currentOnly.open(amys.sealed, keyAdditionalData(amy, 'openai'))).toEqual({
      ok: true,
      value: amysKey,
    });
    expect(bobs && currentOnly.open(bobs.sealed, keyAdditionalData(bob, 'anthropic'))).toEqual({
      ok: true,
      value: bobsKey,
    });
  });

  it('RF-1104 a second start changes nothing (idempotent) and rows under the current key stay as they are', async () => {
    const { keys, step } = setUp();
    await stored(keys, oldBox, amy, 'openai');
    await stored(keys, rotating, bob, 'openai');
    const bobsBefore = plainRecord(await keys.find(bob, 'openai'));
    await step.execute();
    const amysAfterFirst = plainRecord(await keys.find(amy, 'openai'));

    const again = await step.execute();

    expect(again).toEqual({ reEncrypted: 0, unreadable: 0 });
    expect(plainRecord(await keys.find(amy, 'openai'))).toEqual(amysAfterFirst);
    expect(plainRecord(await keys.find(bob, 'openai'))).toEqual(bobsBefore);
  });

  it('RF-1104 reports a row under an unknown key version and keeps it', async () => {
    const { keys, step, logger } = setUp();
    await stored(keys, strangerBox, amy, 'openai-compatible');
    const before = plainRecord(await keys.find(amy, 'openai-compatible'));

    const outcome = await step.execute();

    expect(outcome).toEqual({ reEncrypted: 0, unreadable: 1 });
    expect(plainRecord(await keys.find(amy, 'openai-compatible'))).toEqual(before);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        code: ERROR_CODES.providerKeyUnreadable,
        userId: amy,
        data: {
          provider: 'openai-compatible',
          keyVersion: strangerBox.keyVersion,
          reason: 'unknown key version',
        },
      }),
    );
  });

  it('RF-1104 reports a row under the previous key that does not open, and never logs a key', async () => {
    const { keys, step, logger } = setUp();
    const key = await stored(keys, oldBox, amy, 'openai');
    const row = await keys.find(amy, 'openai');
    if (row === undefined) throw new Error('row expected');
    await keys.upsert({ ...row, sealed: { ...row.sealed, authTag: Buffer.alloc(16, 0) } });

    const outcome = await step.execute();

    expect(outcome).toEqual({ reEncrypted: 0, unreadable: 1 });
    expect(logger.entries).toContainEqual(
      expect.objectContaining({ data: expect.objectContaining({ reason: 'does not open' }) }),
    );
    expect(logger.text()).not.toContain(key);
  });
});
