import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closePool } from '../../../src/presentation/bounded-close.js';
import { RecordingLogger } from '../../support/recording-logger.js';

// RF-1302, ADR-014 (P1-68): on SIGTERM the database pool is closed, but a frozen database must not
// keep the process alive; the close is raced against a 5-second deadline and a warning is logged
// when the deadline wins.

const deadlineMs = 5_000;

/** A pool on a frozen database: `end()` never settles. */
const frozenPool = { end: (): Promise<void> => new Promise<void>(() => undefined) };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('closePool on a frozen database', () => {
  it('RF-1302 resolves at the deadline when the pool end never settles and logs one warning', async () => {
    const logger = new RecordingLogger();
    let resolved = false;

    const closing = closePool(frozenPool, logger).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(deadlineMs - 1);
    expect(resolved).toBe(false);
    expect(logger.records).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
    expect(logger.records).toEqual([expect.objectContaining({ level: 'warn', logger: 'db' })]);
    expect(vi.getTimerCount()).toBe(0);
    await closing;
  });
});

describe('closePool on a healthy database', () => {
  it('RF-1302 resolves as soon as the pool ends, leaves no timer behind and logs nothing', async () => {
    const logger = new RecordingLogger();
    const end = vi.fn(() => Promise.resolve());

    await closePool({ end }, logger);

    expect(end).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(deadlineMs * 2);
    expect(logger.records).toEqual([]);
  });

  it('RF-1302 rejects with the pool error when the end fails before the deadline', async () => {
    const logger = new RecordingLogger();
    const failure = new Error('connection reset');

    await expect(closePool({ end: () => Promise.reject(failure) }, logger)).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.records).toEqual([]);
  });
});
