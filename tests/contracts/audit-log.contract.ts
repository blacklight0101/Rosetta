import { expect, it } from 'vitest';
import type {
  AuditEvent,
  AuditEventInput,
  AuditLog,
} from '../../src/application/ports/audit-log.js';
import { fixturePassword } from '../support/account-fixtures.js';
import { FixedClock } from '../support/fixed-clock.js';

// Architecture section 7: every AuditLog adapter (PgAuditLog, MemoryAuditLog) passes this suite.
// RF-1109: a row holds time, actor, action, target, IP address and outcome; no row contains a
// password or key, so the detail passes the secret masking of P1-04 before it is stored.

const clock = new FixedClock('2026-10-11T09:00:00.000Z');
const userA = '00000000-0000-4000-8000-00000000000a';
const userB = '00000000-0000-4000-8000-00000000000b';

function event(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    at: clock.now(),
    actorUserId: userA,
    action: 'auth.sign_in',
    targetType: 'user',
    targetId: userA,
    ip: '203.0.113.7',
    outcome: 'ok',
    detail: {},
    ...overrides,
  };
}

function minutesAfterStart(count: number): Date {
  const moved = new FixedClock('2026-10-11T09:00:00.000Z');
  moved.advance(count * 60_000);
  return moved.now();
}

/** The event without its generated id, which must be a string. */
function withoutId(row: AuditEvent | undefined): AuditEventInput | undefined {
  if (row === undefined) return undefined;
  const { id, ...rest } = row;
  expect(typeof id).toBe('string');
  return rest;
}

function recordingTests(name: string, fresh: () => Promise<AuditLog>): void {
  it(`RF-1109 ${name} stores time, actor, action, target, IP address and outcome`, async () => {
    const audit = await fresh();
    const input = event({ detail: { reason: 'first sign-in', attempts: 1 } });

    await audit.record(input);
    const listed = await audit.list({ since: minutesAfterStart(-1).getTime() });

    expect(listed).toHaveLength(1);
    expect(withoutId(listed[0])).toEqual(input);
  });

  it(`RF-1109 ${name} stores an anonymous refused attempt without target`, async () => {
    const audit = await fresh();
    const input = event({
      actorUserId: null,
      targetType: null,
      targetId: null,
      outcome: 'refused',
    });

    await audit.record(input);
    const listed = await audit.list({ since: minutesAfterStart(-1).getTime() });

    expect(listed.map(withoutId)).toEqual([input]);
  });

  it(`RF-1109 ${name} masks a password in the detail before it is stored`, async () => {
    const audit = await fresh();
    const password = fixturePassword('Audit');

    await audit.record(
      event({ detail: { password, note: `password=${password}`, nested: [{ pwd: password }] } }),
    );
    const listed = await audit.list({ since: minutesAfterStart(-1).getTime() });

    expect(JSON.stringify(listed)).not.toContain(password);
    expect(listed[0]?.detail).toEqual({
      password: '[MASKED:password]',
      note: 'password=[MASKED:password]',
      nested: [{ pwd: '[MASKED:password]' }],
    });
  });
}

function listingTests(name: string, fresh: () => Promise<AuditLog>): void {
  it(`RF-1109 ${name} lists the newest first, from a time, by user and by action`, async () => {
    const audit = await fresh();
    await audit.record(event({ at: minutesAfterStart(-60), action: 'user.created' }));
    await audit.record(event({ at: minutesAfterStart(1), action: 'auth.sign_in' }));
    await audit.record(event({ at: minutesAfterStart(2), action: 'auth.sign_out' }));
    await audit.record(event({ at: minutesAfterStart(3), actorUserId: userB }));

    const since = minutesAfterStart(0).getTime();
    const all = await audit.list({ since });
    const byUser = await audit.list({ since, actorUserId: userA });
    const byAction = await audit.list({ since, action: 'auth.sign_in' });

    expect(all.map((row) => row.at)).toEqual([3, 2, 1].map(minutesAfterStart));
    expect(byUser.map((row) => row.action)).toEqual(['auth.sign_out', 'auth.sign_in']);
    expect(byAction.map((row) => row.actorUserId)).toEqual([userB, userA]);
  });

  it(`RF-1109 ${name} keeps the insertion order for rows with the same time`, async () => {
    const audit = await fresh();
    await audit.record(event({ action: 'auth.sign_in' }));
    await audit.record(event({ action: 'auth.locked' }));

    const listed = await audit.list({ since: minutesAfterStart(-1).getTime() });

    expect(listed.map((row) => row.action)).toEqual(['auth.locked', 'auth.sign_in']);
  });

  it(`RF-1109 ${name} lists at most the limit, the newest first`, async () => {
    const audit = await fresh();
    for (const minute of [1, 2, 3]) {
      await audit.record(event({ at: minutesAfterStart(minute) }));
    }

    const listed = await audit.list({ since: minutesAfterStart(0).getTime(), limit: 2 });

    expect(listed.map((row) => row.at)).toEqual([3, 2].map(minutesAfterStart));
  });
}

export function auditLogContract(name: string, fresh: () => Promise<AuditLog>): void {
  recordingTests(name, fresh);
  listingTests(name, fresh);
}
