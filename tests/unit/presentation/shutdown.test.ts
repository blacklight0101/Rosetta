import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stopWithin } from '../../../src/presentation/shutdown.js';
import { RecordingLogger } from '../../support/recording-logger.js';

// RF-1302, ADR-014 (P1-68): the whole stop (runs and server, then the database pool) runs under one
// 5-second deadline; a frozen database logs a warning and the stop gives up waiting.

const deadlineMs = 5_000;

const never = (): Promise<void> => new Promise<void>(() => undefined);
const frozenPool = { end: never };
const done = (): Promise<void> => Promise.resolve();

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('stopWithin on a frozen database', () => {
  it('RF-1302 resolves deadline when the pool end never settles and logs one warning', async () => {
    const logger = new RecordingLogger();
    let outcome: string | undefined;

    const stopping = stopWithin({ close: done, pool: frozenPool }, logger).then((value) => {
      outcome = value;
    });

    await vi.advanceTimersByTimeAsync(deadlineMs - 1);
    expect(outcome).toBeUndefined();
    expect(logger.records).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    await stopping;
    expect(outcome).toBe('deadline');
    expect(logger.records).toEqual([expect.objectContaining({ level: 'warn', logger: 'db' })]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('RF-1302 resolves deadline when the runs and the server never finish closing', async () => {
    const logger = new RecordingLogger();

    const stopping = stopWithin({ close: never, pool: { end: done } }, logger);
    await vi.advanceTimersByTimeAsync(deadlineMs);

    await expect(stopping).resolves.toBe('deadline');
    expect(logger.records).toEqual([expect.objectContaining({ level: 'warn' })]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('RF-1302 does not wait for a warning that cannot be written', async () => {
    const logger = new RecordingLogger();
    vi.spyOn(logger, 'log').mockImplementation(never);

    const stopping = stopWithin({ close: done, pool: frozenPool }, logger);
    await vi.advanceTimersByTimeAsync(deadlineMs + 1_000);

    await expect(stopping).resolves.toBe('deadline');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('stopWithin on a healthy database', () => {
  it('RF-1302 closes first, then ends the pool, leaves no timer behind and logs nothing', async () => {
    const logger = new RecordingLogger();
    const order: string[] = [];
    const steps = {
      close: () => {
        order.push('close');
        return Promise.resolve();
      },
      pool: {
        end: () => {
          order.push('end');
          return Promise.resolve();
        },
      },
    };

    await expect(stopWithin(steps, logger)).resolves.toBe('clean');

    expect(order).toEqual(['close', 'end']);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(deadlineMs * 2);
    expect(logger.records).toEqual([]);
  });

  it('RF-1302 still ends the pool and rejects with the error when closing fails', async () => {
    const logger = new RecordingLogger();
    const failure = new Error('server close failed');
    const end = vi.fn(done);

    await expect(
      stopWithin({ close: () => Promise.reject(failure), pool: { end } }, logger),
    ).rejects.toBe(failure);

    expect(end).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('RF-1302 rejects with the pool error when the end fails before the deadline', async () => {
    const logger = new RecordingLogger();
    const failure = new Error('connection reset');

    await expect(
      stopWithin({ close: done, pool: { end: () => Promise.reject(failure) } }, logger),
    ).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.records).toEqual([]);
  });
});
