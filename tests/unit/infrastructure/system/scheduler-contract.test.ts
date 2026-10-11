import { afterEach, beforeEach, vi } from 'vitest';
import { IntervalScheduler } from '../../../../src/infrastructure/system/interval-scheduler.js';
import { schedulerContract } from '../../../contracts/scheduler.contract.js';
import { ManualScheduler } from '../../../support/manual-scheduler.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

schedulerContract('IntervalScheduler', () => {
  const errors: unknown[] = [];
  const scheduler = new IntervalScheduler((error) => errors.push(error));
  return {
    scheduler,
    errors,
    runDue: async () => {
      await vi.advanceTimersByTimeAsync(1000);
    },
  };
});

schedulerContract('ManualScheduler', () => {
  const errors: unknown[] = [];
  const scheduler = new ManualScheduler((error) => errors.push(error));
  return { scheduler, errors, runDue: () => scheduler.tick() };
});
