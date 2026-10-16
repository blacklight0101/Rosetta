import { describe, expect, it } from 'vitest';
import type { AuditEventInput, AuditLog } from '../../../../src/application/ports/audit-log.js';
import {
  RecordRefusedRequest,
  type RefusedRequest,
} from '../../../../src/application/use-cases/record-refused-request.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryAuditLog } from '../../../../src/infrastructure/db/memory-audit-log.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { RecordingLogger } from '../../../support/recording-logger.js';

// RF-1109, DEC-141: refused requests write `request.refused` rows up to 30 a minute per client
// address; past that, one row with reason `rate-limit` counts the rest of that minute. The stored
// path is cut to 512 characters with a marker, never inside a UTF-16 surrogate pair.

const MINUTE = 60_000;
const userId = '00000000-0000-4000-9000-00000000a001';

function harness(auditLog: AuditLog = new MemoryAuditLog(new SecretMasker())) {
  const logger = new RecordingLogger();
  const clock = new FixedClock('2026-10-16T09:00:00.000Z');
  return {
    auditLog,
    logger,
    clock,
    refusals: new RecordRefusedRequest({ auditLog, logger, clock }),
  };
}

function refused(overrides: Partial<RefusedRequest> = {}): RefusedRequest {
  return {
    actor: null,
    reason: 'origin',
    method: 'POST',
    path: '/api/session',
    ip: '203.0.113.7',
    ...overrides,
  };
}

async function refuseMany(parts: ReturnType<typeof harness>, times: number, request = refused()) {
  for (let index = 0; index < times; index += 1) await parts.refusals.execute(request);
}

async function rows(parts: ReturnType<typeof harness>) {
  return parts.auditLog.list({ since: 0, action: 'request.refused' });
}

function hasLoneSurrogate(text: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
}

describe('RecordRefusedRequest limit', () => {
  it('RF-1109 1,000 refusals from one address in a minute write 30 rows and 30 events', async () => {
    const parts = harness();

    await refuseMany(parts, 1_000);

    expect(await rows(parts)).toHaveLength(30);
    expect(parts.logger.records).toHaveLength(30);
  });

  it('RF-1109 the minute ends with one rate-limit row counting the refusals not written', async () => {
    const parts = harness();
    await refuseMany(parts, 1_000);
    parts.clock.advance(MINUTE);

    await parts.refusals.flushEnded();

    const all = await rows(parts);
    expect(all).toHaveLength(31);
    expect(all[0]).toMatchObject({
      actorUserId: null,
      ip: '203.0.113.7',
      outcome: 'refused',
      detail: { reason: 'rate-limit', count: 970, windowStart: '2026-10-16T09:00:00.000Z' },
    });
    expect(parts.logger.records.at(-1)).toMatchObject({
      level: 'warn',
      logger: 'security',
      code: ERROR_CODES.rateLimited,
      data: { reason: 'rate-limit', count: 970, ip: '203.0.113.7' },
    });
  });

  it('RF-1109 the count row is not written before the minute ends', async () => {
    const parts = harness();
    await refuseMany(parts, 40);
    parts.clock.advance(MINUTE - 1);

    await parts.refusals.flushEnded();

    expect(await rows(parts)).toHaveLength(30);
  });
});

describe('RecordRefusedRequest count rows', () => {
  it('RF-1109 the next refusal after the minute writes the count row of the ended minute', async () => {
    const parts = harness();
    await refuseMany(parts, 45);
    parts.clock.advance(MINUTE);

    await parts.refusals.execute(refused({ ip: '198.51.100.1' }));

    const all = await rows(parts);
    expect(all).toHaveLength(32);
    expect(all.map((row) => row.detail)).toContainEqual({
      reason: 'rate-limit',
      count: 15,
      windowStart: '2026-10-16T09:00:00.000Z',
    });
  });

  it('RF-1109 flushAll writes the pending counts of minutes not yet ended', async () => {
    const parts = harness();
    await refuseMany(parts, 33);

    await parts.refusals.flushAll();

    expect((await rows(parts)).map((row) => row.detail)).toContainEqual(
      expect.objectContaining({ reason: 'rate-limit', count: 3 }),
    );
  });
});

describe('RecordRefusedRequest rows below the limit', () => {
  it('RF-1109 a signed-in user below the limit keeps one row per refusal with the actor', async () => {
    const parts = harness();
    const actor = { userId, role: 'user' } as const;

    await refuseMany(parts, 30, refused({ actor, reason: 'role', method: 'GET' }));

    const all = await rows(parts);
    expect(all).toHaveLength(30);
    expect(all.every((row) => row.actorUserId === userId)).toBe(true);
  });

  it('RF-1109 two addresses get 30 rows each', async () => {
    const parts = harness();

    await refuseMany(parts, 40, refused({ ip: '203.0.113.1' }));
    await refuseMany(parts, 40, refused({ ip: '203.0.113.2' }));

    const all = await rows(parts);
    expect(all.filter((row) => row.ip === '203.0.113.1')).toHaveLength(30);
    expect(all.filter((row) => row.ip === '203.0.113.2')).toHaveLength(30);
  });

  it('RF-1109 a count row that cannot be written is logged and never fails the refusal', async () => {
    const memory = new MemoryAuditLog(new SecretMasker());
    let failCounts = false;
    const auditLog: AuditLog = {
      record: (event: AuditEventInput) =>
        failCounts && 'count' in event.detail
          ? Promise.reject(new Error('database down'))
          : memory.record(event),
      list: (filter) => memory.list(filter),
    };
    const parts = harness(auditLog);
    await refuseMany(parts, 31);
    parts.clock.advance(MINUTE);
    failCounts = true;

    await parts.refusals.execute(refused({ ip: '198.51.100.1' }));

    expect(await rows(parts)).toHaveLength(31);
    const failure = parts.logger.records.find((record) => record.level === 'error');
    expect(failure).toMatchObject({ logger: 'security', data: { count: 1 } });
  });
});

describe('RecordRefusedRequest path cut', () => {
  it('RF-1109 a 16 KB path is stored as 512 characters and a cut marker', async () => {
    const parts = harness();
    const path = `/${'a'.repeat(16_383)}`;

    await parts.refusals.execute(refused({ path }));

    const [row] = await rows(parts);
    const [event] = parts.logger.records;
    const stored = `/${'a'.repeat(511)}[cut]`;
    expect(row?.targetId).toBe(`POST ${stored}`);
    expect(event?.message).toBe(`Refused a request (origin): POST ${stored}`);
    expect(event?.data).toMatchObject({ path: stored });
  });

  it('RF-1109 a path of exactly 512 characters is stored whole', async () => {
    const parts = harness();
    const path = `/${'b'.repeat(511)}`;

    await parts.refusals.execute(refused({ path }));

    const [row] = await rows(parts);
    expect(row?.targetId).toBe(`POST ${path}`);
  });

  it('RF-1109 the cut never splits a surrogate pair', async () => {
    const parts = harness();
    const path = `/${'c'.repeat(510)}${'\u{1F600}'.repeat(10)}`;

    await parts.refusals.execute(refused({ path }));

    const [row] = await rows(parts);
    const target = row?.targetId ?? '';
    expect(hasLoneSurrogate(target)).toBe(false);
    expect(target).toBe(`POST /${'c'.repeat(510)}[cut]`);
    expect(hasLoneSurrogate(String(parts.logger.records[0]?.message))).toBe(false);
  });
});
