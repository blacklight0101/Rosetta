import { expect, it } from 'vitest';
import type { ProviderKeyRepository } from '../../src/application/ports/provider-key-repository.js';
import { plainRecord, sampleKeyRecord, sampleSealed } from '../support/provider-key-fixtures.js';

// Architecture section 7, RF-1104: every ProviderKeyRepository adapter (PgProviderKeyRepository,
// MemoryProviderKeyRepository) passes this suite. One row per user and provider; a save replaces
// the earlier row (its creation time kept); every read is scoped by the user; the start-up
// re-encryption lists the rows under other key versions and swaps a row's sealed value only while
// it still holds the value that was read.

export interface ProviderKeyRepositoryHarness {
  readonly repository: ProviderKeyRepository;
  /** Two existing accounts the keys may belong to. */
  readonly userIds: readonly [string, string];
}

const later = new Date('2026-10-12T10:30:00.000Z');

function storageTests(name: string, fresh: () => Promise<ProviderKeyRepositoryHarness>): void {
  it(`RF-1104 ${name} stores a key and finds it by user and provider`, async () => {
    const { repository, userIds } = await fresh();
    const record = sampleKeyRecord(userIds[0], 'openai-compatible');

    const replaced = await repository.upsert(record);
    const found = await repository.find(userIds[0], 'openai-compatible');

    expect(replaced).toBe(false);
    expect(plainRecord(found)).toEqual(plainRecord(record));
  });

  it(`RF-1104 ${name} replaces the key of the same provider and keeps its creation time`, async () => {
    const { repository, userIds } = await fresh();
    const first = sampleKeyRecord(userIds[0], 'openai');
    await repository.upsert(first);
    const second = sampleKeyRecord(userIds[0], 'openai', {
      sealed: sampleSealed(40, 'version-b'),
      last4: 'ZzZ9',
      createdAt: later,
      updatedAt: later,
    });

    const replaced = await repository.upsert(second);
    const found = await repository.find(userIds[0], 'openai');

    expect(replaced).toBe(true);
    expect(plainRecord(found)).toEqual(plainRecord({ ...second, createdAt: first.createdAt }));
  });

  it(`RF-1104 ${name} lists only the user's keys, ordered by provider`, async () => {
    const { repository, userIds } = await fresh();
    await repository.upsert(sampleKeyRecord(userIds[0], 'openai-compatible'));
    await repository.upsert(sampleKeyRecord(userIds[0], 'anthropic'));
    await repository.upsert(sampleKeyRecord(userIds[0], 'openai'));
    await repository.upsert(sampleKeyRecord(userIds[1], 'openai'));

    const listed = await repository.listForUser(userIds[0]);

    expect(listed.map((record) => [record.userId, record.provider])).toEqual([
      [userIds[0], 'anthropic'],
      [userIds[0], 'openai'],
      [userIds[0], 'openai-compatible'],
    ]);
  });
}

function deletionTests(name: string, fresh: () => Promise<ProviderKeyRepositoryHarness>): void {
  it(`RF-1104 ${name} deletes the row so the value is gone, and only that user's row`, async () => {
    const { repository, userIds } = await fresh();
    await repository.upsert(sampleKeyRecord(userIds[0], 'anthropic'));
    await repository.upsert(sampleKeyRecord(userIds[1], 'anthropic'));

    const deleted = await repository.delete(userIds[0], 'anthropic');
    const again = await repository.delete(userIds[0], 'anthropic');

    expect(deleted).toBe(true);
    expect(again).toBe(false);
    expect(await repository.find(userIds[0], 'anthropic')).toBeUndefined();
    expect(await repository.find(userIds[1], 'anthropic')).toBeDefined();
  });

  it(`RF-1105 ${name} answers nothing for an unknown or malformed user id`, async () => {
    const { repository, userIds } = await fresh();
    await repository.upsert(sampleKeyRecord(userIds[0], 'openai'));

    expect(await repository.find('00000000-0000-4000-9000-0000000000ee', 'openai')).toBeUndefined();
    expect(await repository.find('not-a-uuid', 'openai')).toBeUndefined();
    expect(await repository.listForUser('not-a-uuid')).toEqual([]);
    expect(await repository.delete('not-a-uuid', 'openai')).toBe(false);
  });
}

function rotationTests(name: string, fresh: () => Promise<ProviderKeyRepositoryHarness>): void {
  it(`RF-1104 ${name} lists the rows under any other key version, by user then provider`, async () => {
    const { repository, userIds } = await fresh();
    const [first, second] = [...userIds].sort();
    if (first === undefined || second === undefined) throw new Error('two users expected');
    await repository.upsert(sampleKeyRecord(second, 'openai', { sealed: sampleSealed(3, 'old') }));
    await repository.upsert(
      sampleKeyRecord(first, 'openai', { sealed: sampleSealed(4, 'current') }),
    );
    await repository.upsert(sampleKeyRecord(first, 'anthropic', { sealed: sampleSealed(5, 'x') }));

    const outside = await repository.listOutsideVersion('current');

    expect(outside.map((record) => [record.userId, record.provider])).toEqual([
      [first, 'anthropic'],
      [second, 'openai'],
    ]);
  });

  it(`RF-1104 ${name} reseals a row only while it still holds the sealed value that was read`, async () => {
    const { repository, userIds } = await fresh();
    const stored = sampleKeyRecord(userIds[0], 'openai', { sealed: sampleSealed(3, 'old') });
    await repository.upsert(stored);
    const resealed = sampleSealed(9, 'current');

    const staleRead = { ...stored.sealed, iv: Buffer.alloc(12, 0) };

    const stale = await repository.reseal(stored, staleRead, sampleSealed(7, 'current'));
    const swapped = await repository.reseal(stored, stored.sealed, resealed);
    const twice = await repository.reseal(stored, stored.sealed, sampleSealed(11, 'current'));

    expect(stale).toBe(false);
    expect(swapped).toBe(true);
    expect(twice).toBe(false);
    expect(plainRecord(await repository.find(userIds[0], 'openai'))).toEqual(
      plainRecord({ ...stored, sealed: resealed }),
    );
  });
}

// RF-1104, RF-1105
export function providerKeyRepositoryContract(
  name: string,
  fresh: () => Promise<ProviderKeyRepositoryHarness>,
): void {
  storageTests(name, fresh);
  deletionTests(name, fresh);
  rotationTests(name, fresh);
}
