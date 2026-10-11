import { describe, expect, it, vi } from 'vitest';
import type { Scheduler } from '../../src/application/ports/scheduler.js';

export interface SchedulerHarness {
  readonly scheduler: Scheduler;
  /** Makes every job registered with an interval of 1000 ms due and waits for it to finish. */
  readonly runDue: () => Promise<void>;
  /** Failures reported by the scheduler. */
  readonly errors: unknown[];
}

/** Contract of the Scheduler port (DEC-112): every adapter and fake must pass it. */
export function schedulerContract(name: string, create: () => SchedulerHarness): void {
  describe(`Scheduler contract: ${name}`, () => {
    it('RF-1101 runs a registered job when it is due', async () => {
      const { scheduler, runDue } = create();
      const job = vi.fn(() => Promise.resolve());
      scheduler.every(1000, job);

      await runDue();

      expect(job).toHaveBeenCalledTimes(1);
    });

    it('RF-1101 does not run a cancelled job, and cancelling twice is harmless', async () => {
      const { scheduler, runDue } = create();
      const job = vi.fn(() => Promise.resolve());
      const cancel = scheduler.every(1000, job);
      cancel();
      cancel();

      await runDue();

      expect(job).not.toHaveBeenCalled();
    });

    it('RF-1101 reports a failing job, still runs the other jobs and the next round', async () => {
      const { scheduler, runDue, errors } = create();
      const failure = new Error('purge failed');
      const failing = vi.fn(() => Promise.reject(failure));
      const healthy = vi.fn(() => Promise.resolve());
      scheduler.every(1000, failing);
      scheduler.every(1000, healthy);

      await runDue();
      await runDue();

      expect(errors).toEqual([failure, failure]);
      expect(healthy).toHaveBeenCalledTimes(2);
    });
  });
}
