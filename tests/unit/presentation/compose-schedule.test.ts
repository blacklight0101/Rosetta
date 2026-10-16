import { describe, expect, it, vi } from 'vitest';
import type { AuditRetention } from '../../../src/application/ports/audit-retention.js';
import { RecordRefusedRequest } from '../../../src/application/use-cases/record-refused-request.js';
import { MemoryAuditLog } from '../../../src/infrastructure/db/memory-audit-log.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import {
  auditRetentionTask,
  refusalCountTask,
  startScheduledTasks,
  type ScheduledTask,
} from '../../../src/presentation/compose-schedule.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { ManualScheduler } from '../../support/manual-scheduler.js';
import { RecordingLogger } from '../../support/recording-logger.js';

// DEC-132, RF-1109: the audit retention task runs at start-up and every 24 hours, and is stopped
// with the other scheduled tasks by the shutdown.

const DAY = 86_400_000;

function setUp() {
  const cutOffs: Date[] = [];
  const retention: AuditRetention = {
    purgeBefore: (cutOff) => {
      cutOffs.push(cutOff);
      return Promise.resolve(0);
    },
  };
  const task = auditRetentionTask({
    retention,
    clock: new FixedClock('2026-10-13T09:00:00.000Z'),
    logger: new RecordingLogger(),
  });
  return { cutOffs, task, scheduler: new ManualScheduler(() => undefined) };
}

describe('auditRetentionTask', () => {
  it('RF-1109 repeats every 24 hours and also runs at start-up', () => {
    const { task } = setUp();

    expect(task.intervalMs).toBe(DAY);
    expect(task.runAtStart).toBe(true);
  });

  it('RF-1109 calls the retention at start-up without waiting for the first interval', async () => {
    const { cutOffs, task, scheduler } = setUp();

    startScheduledTasks(scheduler, [task]);

    await vi.waitFor(() => {
      expect(cutOffs).toHaveLength(1);
    });
  });

  it('RF-1109 calls the retention again at each interval', async () => {
    const { cutOffs, task, scheduler } = setUp();
    startScheduledTasks(scheduler, [task]);
    await vi.waitFor(() => {
      expect(cutOffs).toHaveLength(1);
    });

    await scheduler.tick();

    expect(scheduler.intervals).toEqual([DAY]);
    expect(cutOffs).toHaveLength(2);
  });

  it('RF-1109 stops when the shutdown cancels the tasks', async () => {
    const { cutOffs, task, scheduler } = setUp();
    const cancels = startScheduledTasks(scheduler, [task]);
    await vi.waitFor(() => {
      expect(cutOffs).toHaveLength(1);
    });

    for (const cancel of cancels) cancel();
    await scheduler.tick();

    expect(scheduler.activeJobs).toBe(0);
    expect(cutOffs).toHaveLength(1);
  });
});

describe('startScheduledTasks', () => {
  it('RF-1101 runs only the tasks marked runAtStart at start-up and registers all of them', async () => {
    const early = vi.fn(() => Promise.resolve());
    const late = vi.fn(() => Promise.resolve());
    const tasks: ScheduledTask[] = [
      { intervalMs: 1000, job: early, runAtStart: true },
      { intervalMs: 2000, job: late },
    ];
    const scheduler = new ManualScheduler(() => undefined);

    startScheduledTasks(scheduler, tasks);
    await vi.waitFor(() => {
      expect(early).toHaveBeenCalledTimes(1);
    });

    expect(late).not.toHaveBeenCalled();
    expect(scheduler.intervals).toEqual([1000, 2000]);
  });

  it('RF-1101 a start-up run that fails does not stop the other tasks', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('down')));
    const healthy = vi.fn(() => Promise.resolve());
    const scheduler = new ManualScheduler(() => undefined);

    expect(() => {
      startScheduledTasks(scheduler, [
        { intervalMs: 1000, job: failing, runAtStart: true },
        { intervalMs: 1000, job: healthy, runAtStart: true },
      ]);
    }).not.toThrow();

    await vi.waitFor(() => {
      expect(healthy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('refusalCountTask', () => {
  it('RF-1109 writes the count row of an ended minute at the next one-minute tick', async () => {
    const clock = new FixedClock('2026-10-16T09:00:00.000Z');
    const auditLog = new MemoryAuditLog(new SecretMasker());
    const refusals = new RecordRefusedRequest({ auditLog, logger: new RecordingLogger(), clock });
    const refused = {
      actor: null,
      reason: 'origin',
      method: 'POST',
      path: '/',
      ip: '203.0.113.9',
    } as const;
    for (let index = 0; index < 32; index += 1) await refusals.execute(refused);
    const scheduler = new ManualScheduler(() => undefined);
    startScheduledTasks(scheduler, [refusalCountTask(refusals)]);
    clock.advance(60_000);

    await scheduler.tick();

    expect(scheduler.intervals).toEqual([60_000]);
    const rows = await auditLog.list({ since: 0, action: 'request.refused' });
    expect(rows.map((row) => row.detail)).toContainEqual(
      expect.objectContaining({ reason: 'rate-limit', count: 2 }),
    );
  });
});
