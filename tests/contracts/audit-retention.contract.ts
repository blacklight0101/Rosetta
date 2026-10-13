import { expect, it } from 'vitest';
import type { AuditLog } from '../../src/application/ports/audit-log.js';
import type { AuditRetention } from '../../src/application/ports/audit-retention.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';

// DEC-132, RF-1109: every AuditRetention adapter (PgAuditRetention, MemoryAuditRetention) passes
// this suite. Rows older than the cut-off go; the store refuses any cut-off younger than 365 days
// on its own clock, whatever the caller believes the time is.

const DAY = 86_400_000;
const MINUTE = 60_000;

interface RetentionHarness {
  readonly retention: AuditRetention;
  readonly audit: AuditLog;
  /** The store's own clock. */
  readonly now: () => Date;
}

type Fresh = () => Promise<RetentionHarness>;

function daysAgo(harness: RetentionHarness, days: number): Date {
  return new Date(harness.now().getTime() - days * DAY);
}

async function recordAt(harness: RetentionHarness, at: Date, action: string): Promise<void> {
  await harness.audit.record({
    at,
    actorUserId: null,
    action,
    targetType: null,
    targetId: null,
    ip: '203.0.113.7',
    outcome: 'ok',
    detail: {},
  });
}

async function actionsKept(harness: RetentionHarness): Promise<string[]> {
  const rows = await harness.audit.list({ since: 0 });
  return rows.map((row) => row.action).sort();
}

function deletionTests(name: string, fresh: Fresh): void {
  it(`RF-1109 ${name} deletes the rows older than the cut-off, keeps the rest and counts them`, async () => {
    const harness = await fresh();
    await recordAt(harness, daysAgo(harness, 400), 'old.a');
    await recordAt(harness, daysAgo(harness, 370), 'old.b');
    await recordAt(harness, daysAgo(harness, 364), 'young.a');
    await recordAt(harness, harness.now(), 'young.b');

    const deleted = await harness.retention.purgeBefore(daysAgo(harness, 366));

    expect(deleted).toBe(2);
    expect(await actionsKept(harness)).toEqual(['young.a', 'young.b']);
  });

  it(`RF-1109 ${name} keeps a row between 365 days old and the cut-off`, async () => {
    const harness = await fresh();
    await recordAt(harness, daysAgo(harness, 365.5), 'between');
    await recordAt(harness, daysAgo(harness, 380), 'old');

    const deleted = await harness.retention.purgeBefore(daysAgo(harness, 366));

    expect(deleted).toBe(1);
    expect(await actionsKept(harness)).toEqual(['between']);
  });

  it(`RF-1109 ${name} deletes nothing and answers 0 when no row is old enough`, async () => {
    const harness = await fresh();
    await recordAt(harness, daysAgo(harness, 100), 'recent');

    expect(await harness.retention.purgeBefore(daysAgo(harness, 366))).toBe(0);
    expect(await actionsKept(harness)).toEqual(['recent']);
  });
}

function refusalTests(name: string, fresh: Fresh): void {
  it.each([
    ['now', 0],
    ['100 days ago', 100],
    ['364 days ago', 364],
  ])(`RF-1109 ${name} refuses a cut-off of %s and deletes nothing`, async (_label, days) => {
    const harness = await fresh();
    await recordAt(harness, daysAgo(harness, 400), 'old');
    await recordAt(harness, daysAgo(harness, 200), 'middle');

    await expect(harness.retention.purgeBefore(daysAgo(harness, days))).rejects.toMatchObject({
      code: ERROR_CODES.databaseQueryFailed,
    });

    expect(await actionsKept(harness)).toEqual(['middle', 'old']);
  });

  it(`RF-1109 ${name} refuses a cut-off a minute younger than 365 days and accepts one a minute older`, async () => {
    const harness = await fresh();
    await recordAt(harness, daysAgo(harness, 400), 'old');
    const edge = harness.now().getTime() - 365 * DAY;

    await expect(harness.retention.purgeBefore(new Date(edge + MINUTE))).rejects.toMatchObject({
      code: ERROR_CODES.databaseQueryFailed,
    });
    expect(await actionsKept(harness)).toEqual(['old']);

    expect(await harness.retention.purgeBefore(new Date(edge - MINUTE))).toBe(1);
  });
}

function clockTests(name: string, fresh: Fresh): void {
  it(`RF-1109 ${name} measures the 365 days on its own clock: a caller two days ahead is refused`, async () => {
    const harness = await fresh();
    await recordAt(harness, daysAgo(harness, 400), 'old');
    const callerThinksTwoDaysLater = harness.now().getTime() + 2 * DAY;

    await expect(
      harness.retention.purgeBefore(new Date(callerThinksTwoDaysLater - 365 * DAY)),
    ).rejects.toMatchObject({ code: ERROR_CODES.databaseQueryFailed });

    expect(await actionsKept(harness)).toEqual(['old']);
  });

  it(`RF-1109 ${name} accepts the cut-off of a caller two days behind`, async () => {
    const harness = await fresh();
    await recordAt(harness, daysAgo(harness, 400), 'old');
    const callerThinksTwoDaysEarlier = harness.now().getTime() - 2 * DAY;

    const deleted = await harness.retention.purgeBefore(
      new Date(callerThinksTwoDaysEarlier - 365 * DAY),
    );

    expect(deleted).toBe(1);
  });
}

export function auditRetentionContract(name: string, fresh: Fresh): void {
  deletionTests(name, fresh);
  refusalTests(name, fresh);
  clockTests(name, fresh);
}
