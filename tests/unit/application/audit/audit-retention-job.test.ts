import { describe, expect, it } from 'vitest';
import {
  AUDIT_RETENTION_DAYS,
  CLOCK_SKEW_MARGIN_MS,
  auditRetentionJob,
} from '../../../../src/application/audit/audit-retention-job.js';
import type { AuditRetention } from '../../../../src/application/ports/audit-retention.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { RecordingLogger } from '../../../support/recording-logger.js';

// DEC-132, RF-1109: the daily job asks the store to delete the rows older than 365 days; a failure
// is logged with its code and never rejects, so it cannot stop the server.

const DAY = 86_400_000;
const now = '2026-10-13T09:00:00.000Z';

class RecordingRetention implements AuditRetention {
  readonly cutOffs: Date[] = [];
  private readonly outcome: () => Promise<number>;

  constructor(outcome: () => Promise<number>) {
    this.outcome = outcome;
  }

  purgeBefore(cutOff: Date): Promise<number> {
    this.cutOffs.push(cutOff);
    return this.outcome();
  }
}

function setUp(outcome: () => Promise<number>) {
  const retention = new RecordingRetention(outcome);
  const logger = new RecordingLogger();
  const clock = new FixedClock(now);
  return { retention, logger, job: auditRetentionJob({ retention, clock, logger }) };
}

describe('auditRetentionJob', () => {
  it('RF-1109 keeps audit rows for 365 days', () => {
    expect(AUDIT_RETENTION_DAYS).toBe(365);
  });

  it('RF-1109 asks the store to delete rows older than 365 days plus the clock-skew margin', async () => {
    const { retention, job } = setUp(() => Promise.resolve(0));

    await job();

    const expected = new Date(now).getTime() - AUDIT_RETENTION_DAYS * DAY - CLOCK_SKEW_MARGIN_MS;
    expect(retention.cutOffs.map((cutOff) => cutOff.getTime())).toEqual([expected]);
  });

  it('RF-1109 the clock-skew margin is positive and at most a day', () => {
    expect(CLOCK_SKEW_MARGIN_MS).toBeGreaterThan(0);
    expect(CLOCK_SKEW_MARGIN_MS).toBeLessThanOrEqual(DAY);
  });

  it('RF-1109 logs how many rows it deleted', async () => {
    const { logger, job } = setUp(() => Promise.resolve(7));

    await job();

    expect(logger.records).toEqual([
      expect.objectContaining({ level: 'info', logger: 'audit-retention', data: { deleted: 7 } }),
    ]);
  });

  it('RF-1109 logs a failure with its code and resolves, so the server keeps running', async () => {
    const failure = new RosettaError(ERROR_CODES.databaseQueryFailed);
    const { logger, job } = setUp(() => Promise.reject(failure));

    await expect(job()).resolves.toBeUndefined();

    expect(logger.records).toEqual([
      expect.objectContaining({
        level: 'error',
        logger: 'audit-retention',
        code: ERROR_CODES.databaseQueryFailed,
      }),
    ]);
  });

  it('RF-1109 logs a failure that is not a RosettaError with the database code', async () => {
    const { logger, job } = setUp(() => Promise.reject(new Error('connection reset')));

    await job();

    expect(logger.records).toEqual([
      expect.objectContaining({ level: 'error', code: ERROR_CODES.databaseQueryFailed }),
    ]);
  });

  it('RF-1109 runs again on the next call after a failure', async () => {
    let calls = 0;
    const { retention, job } = setUp(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('down')) : Promise.resolve(0);
    });

    await job();
    await job();

    expect(retention.cutOffs).toHaveLength(2);
  });
});
