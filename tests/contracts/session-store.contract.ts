import { expect, it } from 'vitest';
import type { SessionStore } from '../../src/application/ports/session-store.js';
import { hashSessionId } from '../../src/infrastructure/security/session-ids.js';

// Architecture section 7, RF-1101: every SessionStore adapter (PgSessionStore, MemorySessionStore)
// passes this suite. The id is 256 bits, handed out once; only its SHA-256 is kept; a session
// expires at min(last seen + 8 h, created + 7 days) and an expired one is ended, not extended.

export interface SessionStoreHarness {
  readonly store: SessionStore;
  /** Two existing accounts the sessions may belong to. */
  readonly userIds: readonly [string, string];
  /** The stored keys of every session, as lower-case hexadecimal. */
  storedHashes(): Promise<readonly string[]>;
}

const start = new Date('2026-10-11T09:00:00.000Z');
const hourMs = 3_600_000;

function at(hours: number): Date {
  return new Date(start.getTime() + hours * hourMs);
}

function lifecycleTests(name: string, fresh: () => Promise<SessionStoreHarness>): void {
  it(`RF-1101 ${name} creates a session under a new 43-character id and finds it by that id`, async () => {
    const { store, userIds } = await fresh();
    const input = { userId: userIds[0], ip: '203.0.113.7', userAgent: 'Browser/1.0', now: start };

    const first = await store.create(input);
    const second = await store.create(input);
    const found = await store.touch(first.id, start);

    expect(first.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.id).not.toBe(first.id);
    expect(first.session).toEqual({
      userId: userIds[0],
      createdAt: start,
      lastSeenAt: start,
      expiresAt: at(8),
      ip: '203.0.113.7',
      userAgent: 'Browser/1.0',
    });
    expect(found).toEqual(first.session);
  });

  it(`RF-1101 ${name} keeps only the SHA-256 of the id`, async () => {
    const harness = await fresh();
    const { id } = await harness.store.create({
      userId: harness.userIds[0],
      ip: '203.0.113.7',
      userAgent: '',
      now: start,
    });

    const stored = await harness.storedHashes();

    expect(stored).toEqual([hashSessionId(id).toString('hex')]);
    expect(stored.join(' ')).not.toContain(id);
  });
}

function lookupTests(name: string, fresh: () => Promise<SessionStoreHarness>): void {
  it(`RF-1101 ${name} cuts the user agent to 200 characters`, async () => {
    const { store, userIds } = await fresh();
    const userAgent = 'é'.repeat(250);

    const created = await store.create({ userId: userIds[0], ip: '', userAgent, now: start });
    const found = await store.touch(created.id, start);

    expect(created.session.userAgent).toBe('é'.repeat(200));
    expect(found?.userAgent).toBe('é'.repeat(200));
  });

  it(`RF-1101 ${name} answers nothing for an unknown or malformed id`, async () => {
    const { store, userIds } = await fresh();
    const { id } = await store.create({ userId: userIds[0], ip: '', userAgent: '', now: start });
    const unknown = `${id.slice(0, 42)}${id.endsWith('A') ? 'B' : 'A'}`;

    expect(await store.touch(unknown, start)).toBeUndefined();
    expect(await store.touch('not an id', start)).toBeUndefined();
    expect(await store.end('not an id')).toBe(false);
  });
}

function expiryTests(name: string, fresh: () => Promise<SessionStoreHarness>): void {
  it(`RF-1101 ${name} moves the idle timeout on each touch`, async () => {
    const { store, userIds } = await fresh();
    const { id } = await store.create({ userId: userIds[0], ip: '', userAgent: '', now: start });

    const touched = await store.touch(id, at(7));

    expect(touched).toMatchObject({ createdAt: start, lastSeenAt: at(7), expiresAt: at(15) });
  });

  it(`RF-1101 ${name} ends a session after 8 hours without activity`, async () => {
    const harness = await fresh();
    const { id } = await harness.store.create({
      userId: harness.userIds[0],
      ip: '',
      userAgent: '',
      now: start,
    });

    expect(await harness.store.touch(id, at(8))).toBeUndefined();
    expect(await harness.storedHashes()).toEqual([]);
    expect(await harness.store.touch(id, at(1))).toBeUndefined();
  });

  it(`RF-1101 ${name} ends a session 7 days after sign-in even when it is used`, async () => {
    const { store, userIds } = await fresh();
    const { id } = await store.create({ userId: userIds[0], ip: '', userAgent: '', now: start });
    for (let hours = 7; hours < 7 * 24; hours += 7) {
      expect(await store.touch(id, at(hours))).toBeDefined();
    }

    const lastHour = await store.touch(id, at(7 * 24 - 1));
    const afterSevenDays = await store.touch(id, at(7 * 24));

    expect(lastHour?.expiresAt).toEqual(at(7 * 24));
    expect(afterSevenDays).toBeUndefined();
  });

  it(`RF-1101 ${name} purges only the expired sessions`, async () => {
    const harness = await fresh();
    const { store, userIds } = harness;
    await store.create({ userId: userIds[0], ip: '', userAgent: '', now: start });
    const live = await store.create({ userId: userIds[1], ip: '', userAgent: '', now: at(5) });

    const purged = await store.purgeExpired(at(9));

    expect(purged).toBe(1);
    expect(await harness.storedHashes()).toEqual([hashSessionId(live.id).toString('hex')]);
  });
}

function endingTests(name: string, fresh: () => Promise<SessionStoreHarness>): void {
  it(`RF-1101 ${name} ends one session`, async () => {
    const { store, userIds } = await fresh();
    const { id } = await store.create({ userId: userIds[0], ip: '', userAgent: '', now: start });

    expect(await store.end(id)).toBe(true);
    expect(await store.end(id)).toBe(false);
    expect(await store.touch(id, start)).toBeUndefined();
  });

  it(`RF-1101 ${name} ends every session of one user and keeps the others`, async () => {
    const { store, userIds } = await fresh();
    const input = { ip: '', userAgent: '', now: start };
    const first = await store.create({ userId: userIds[0], ...input });
    const second = await store.create({ userId: userIds[0], ...input });
    const other = await store.create({ userId: userIds[1], ...input });

    const ended = await store.endAllForUser(userIds[0]);

    expect(ended).toBe(2);
    expect(await store.touch(first.id, start)).toBeUndefined();
    expect(await store.touch(second.id, start)).toBeUndefined();
    expect(await store.touch(other.id, start)).toBeDefined();
    expect(await store.endAllForUser('not-a-user')).toBe(0);
  });
}

export function sessionStoreContract(
  name: string,
  fresh: () => Promise<SessionStoreHarness>,
): void {
  lifecycleTests(name, fresh);
  lookupTests(name, fresh);
  expiryTests(name, fresh);
  endingTests(name, fresh);
}
