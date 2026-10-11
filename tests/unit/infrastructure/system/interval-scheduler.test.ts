import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntervalScheduler } from '../../../../src/infrastructure/system/interval-scheduler.js';

describe('IntervalScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('RF-1101 runs a job once per interval', async () => {
    const job = vi.fn(() => Promise.resolve());
    new IntervalScheduler(vi.fn()).every(1000, job);

    await vi.advanceTimersByTimeAsync(3500);

    expect(job).toHaveBeenCalledTimes(3);
  });

  it('RF-1101 stops a job when it is cancelled', async () => {
    const job = vi.fn(() => Promise.resolve());
    const cancel = new IntervalScheduler(vi.fn()).every(1000, job);

    await vi.advanceTimersByTimeAsync(1000);
    cancel();
    await vi.advanceTimersByTimeAsync(5000);

    expect(job).toHaveBeenCalledTimes(1);
  });

  it('RF-1101 reports a failing job and keeps the schedule', async () => {
    const failure = new Error('purge failed');
    const onError = vi.fn();
    const job = vi.fn(() => Promise.reject(failure));
    new IntervalScheduler(onError).every(1000, job);

    await vi.advanceTimersByTimeAsync(2000);

    expect(onError).toHaveBeenCalledWith(failure);
    expect(job).toHaveBeenCalledTimes(2);
  });

  it('RF-1101 skips a tick while the previous run is still going', async () => {
    let release: () => void = () => undefined;
    const job = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    new IntervalScheduler(vi.fn()).every(1000, job);

    await vi.advanceTimersByTimeAsync(3000);
    expect(job).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);

    expect(job).toHaveBeenCalledTimes(2);
  });
});
