import { describe, expect, it, vi } from 'vitest';
import type { AuditRetention } from '../../../src/application/ports/audit-retention.js';
import {
  auditRetentionTask,
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
