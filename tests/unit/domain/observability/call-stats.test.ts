import { describe, expect, it } from 'vitest';
import {
  percentile,
  summarizeCalls,
  type CallSample,
} from '../../../../src/domain/observability/call-stats.js';

// RF-1011, DEC-57: P50 and P95 by the nearest-rank method, and the summary per provider and role.

function sample(overrides: Partial<CallSample> = {}): CallSample {
  return {
    provider: 'ollama',
    role: 'reader',
    status: 'ok',
    latencyMs: 1000,
    timeToFirstTokenMs: 400,
    inputTokens: 100,
    outputTokens: 10,
    costMicros: 0,
    ...overrides,
  };
}

describe('percentile', () => {
  it('RF-1011 takes the value at the nearest rank', () => {
    const values = [15, 20, 35, 40, 50];

    expect(percentile(values, 50)).toBe(35);
    expect(percentile(values, 95)).toBe(50);
    expect(percentile(values, 20)).toBe(15);
  });

  it('RF-1011 does not depend on the order of the values', () => {
    expect(percentile([50, 15, 40, 20, 35], 50)).toBe(35);
  });

  it('RF-1011 gives P50 and P95 of twenty values as the 10th and the 19th', () => {
    const values = Array.from({ length: 20 }, (_item, index) => (index + 1) * 10);

    expect(percentile(values, 50)).toBe(100);
    expect(percentile(values, 95)).toBe(190);
  });

  it('RF-1011 gives P50 of two values as the lower and P95 as the higher', () => {
    // Nearest rank: ceil(50 * 2 / 100) = 1 and ceil(95 * 2 / 100) = 2.
    expect(percentile([20, 10], 50)).toBe(10);
    expect(percentile([20, 10], 95)).toBe(20);
  });

  it('RF-1011 gives the only value for any percentile and nothing for no values', () => {
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });
});

describe('summarizeCalls', () => {
  it('RF-1011 groups attempts by provider and role in a fixed order', () => {
    const rows = summarizeCalls([
      sample({ provider: 'openai', role: 'verifier' }),
      sample({ provider: 'ollama', role: 'reader' }),
      sample({ provider: 'openai', role: 'reader' }),
      sample({ provider: 'ollama', role: 'reader' }),
    ]);

    expect(rows.map((row) => [row.provider, row.role, row.calls])).toEqual([
      ['ollama', 'reader', 2],
      ['openai', 'reader', 1],
      ['openai', 'verifier', 1],
    ]);
  });

  it('RF-1011 counts retried, failed and refused attempts, and errors as retried plus failed', () => {
    const [row] = summarizeCalls([
      sample({ provider: 'openai', status: 'ok' }),
      sample({ provider: 'openai', status: 'retried' }),
      sample({ provider: 'openai', status: 'failed' }),
      sample({ provider: 'openai', status: 'failed' }),
      sample({ provider: 'openai', status: 'refused-by-cap' }),
    ]);

    expect(row).toMatchObject({ calls: 5, retried: 1, failed: 2, refused: 1, errors: 3 });
  });
});

describe('summarizeCalls percentiles', () => {
  it('RF-1011 computes P50 and P95 of latency and of time to first token over the answered attempts', () => {
    const answered = Array.from({ length: 20 }, (_item, index) =>
      sample({ latencyMs: (index + 1) * 100, timeToFirstTokenMs: (index + 1) * 10 }),
    );
    const failed = sample({ status: 'failed', latencyMs: 30_000, timeToFirstTokenMs: 0 });

    const [row] = summarizeCalls([...answered, failed]);

    expect(row).toMatchObject({
      calls: 21,
      latencyP50Ms: 1000,
      latencyP95Ms: 1900,
      firstTokenP50Ms: 100,
      firstTokenP95Ms: 190,
    });
  });

  it('RF-1011 gives no percentile to a group whose attempts all failed', () => {
    const [row] = summarizeCalls([sample({ status: 'failed' }), sample({ status: 'retried' })]);

    expect(row).toMatchObject({
      latencyP50Ms: null,
      latencyP95Ms: null,
      firstTokenP50Ms: null,
      firstTokenP95Ms: null,
    });
  });

  it('RF-1011 gives tokens per second for Ollama as the mean of its answered attempts, and none for other providers', () => {
    const rows = summarizeCalls([
      sample({ ollama: { tokensPerSecond: 30 } }),
      sample({ ollama: { tokensPerSecond: 40 } }),
      sample({ status: 'failed', ollama: { tokensPerSecond: 900 } }),
      sample({ provider: 'openai' }),
    ]);

    expect(rows.find((row) => row.provider === 'ollama')?.tokensPerSecond).toBe(35);
    expect(rows.find((row) => row.provider === 'openai')?.tokensPerSecond).toBeNull();
  });
});

describe('summarizeCalls totals', () => {
  it('RF-1011 adds up the tokens and the cost of the group', () => {
    const [row] = summarizeCalls([
      sample({ inputTokens: 100, outputTokens: 10, costMicros: 5 }),
      sample({ inputTokens: 200, outputTokens: 20, costMicros: 7 }),
    ]);

    expect(row).toMatchObject({ inputTokens: 300, outputTokens: 30, costMicros: 12 });
  });

  it('RF-1011 gives no rows for no attempts', () => {
    expect(summarizeCalls([])).toEqual([]);
  });
});
