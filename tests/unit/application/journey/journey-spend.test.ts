import { describe, expect, it } from 'vitest';
import { journeyOfFacts } from '../../../../src/application/journey/journey-of-facts.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// P9-08, RF-1020, RF-011, EV-107: the journey tells its own spend once, with its approved amount, so the strip
// never adds run costs in the browser. A run queued before the journey began is not a step of it.

const owner = { userId: 'u', projectId: 'p' };
const began = 10_000;
const totals = (costMicros: number) => ({
  ...{ costMicros, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
});

function run(runKey: string, stage: Run['stage'], queuedAt: number, cost: number): Run {
  return sampleRun({
    ...{ userId: 'u', projectId: 'p', runKey, stage, queuedAt, totals: totals(cost) },
    ...{ queueState: 'Ended', endState: 'Completed', endedAt: queuedAt + 1 },
    ...(stage === 'plan' ? { planSourceKey: 'b-deepen' } : {}),
  });
}

describe('RF-1020 P9-08 the journey spend', () => {
  it('RF-1020 counts every understand, Deepen and plan run, and reads the raised amount', () => {
    const runs = [
      run('c-plan', 'plan', began + 3_000, 60_000),
      run('b-deepen', 'understand', began + 2_000, 32_900),
      run('a-understand', 'understand', began + 1_000, 67_700),
    ];
    // $0.10 approved, raised by $0.0338 with Continue (P9-01).
    const approved = { tokens: 0, costMicros: 133_800 };
    const record = { ...owner, approved, createdAt: began };

    const journey = journeyOfFacts({ runs, briefSavedAt: null, record, positions: new Map() });

    expect(journey).toMatchObject({
      ok: true,
      value: { budget: { spentMicros: 160_600, approvedMicros: 133_800, remainingMicros: 0 } },
    });
  });

  it('RF-1020 a run queued before the journey is not a step of it', () => {
    const runs = [
      run('b-deepen', 'understand', began + 2_000, 30_000),
      run('a-old', 'understand', began - 5_000, 500_000),
    ];
    const record = { ...owner, approved: { tokens: 0, costMicros: 100_000 }, createdAt: began };

    const journey = journeyOfFacts({ runs, briefSavedAt: null, record, positions: new Map() });

    expect(journey).toMatchObject({ ok: true, value: { budget: { spentMicros: 30_000 } } });
  });
});
