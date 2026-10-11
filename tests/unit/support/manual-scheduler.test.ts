import { describe, expect, it, vi } from 'vitest';
import { ManualScheduler } from '../../support/manual-scheduler.js';

describe('ManualScheduler', () => {
  it('RF-1101 runs every registered job only when ticked', async () => {
    const scheduler = new ManualScheduler(vi.fn());
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());
    scheduler.every(3_600_000, first);
    scheduler.every(86_400_000, second);

    expect(first).not.toHaveBeenCalled();
    await scheduler.tick();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('RF-1101 forgets a cancelled job', async () => {
    const scheduler = new ManualScheduler(vi.fn());
    const job = vi.fn(() => Promise.resolve());
    const cancel = scheduler.every(1000, job);

    expect(scheduler.activeJobs).toBe(1);
    cancel();
    await scheduler.tick();

    expect(scheduler.activeJobs).toBe(0);
    expect(job).not.toHaveBeenCalled();
  });

  it('RF-1101 exposes the interval each job asked for', () => {
    const scheduler = new ManualScheduler(vi.fn());
    scheduler.every(1000, () => Promise.resolve());
    scheduler.every(5000, () => Promise.resolve());

    expect(scheduler.intervals).toEqual([1000, 5000]);
  });
});
