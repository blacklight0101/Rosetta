import { describe, expect, it } from 'vitest';
import {
  continueRun,
  endRun,
  pauseRun,
  reopenRun,
  startRun,
  type Run,
} from '../../../../src/domain/runs/run.js';
import { runTimesOf } from '../../../../src/domain/runs/run-times.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-006, RF-1008, P8-88 (EV-93): a resumed run keeps its first start; its running time is the sum
// of the spans in which it was running, its wall time runs from its first start to its end.

const minute = 60_000;

function must(result: { ok: true; value: Run } | { ok: false; error: string }): Run {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Runs 52.2 min, is stopped, is resumed 64 min later and runs 13.8 min more: 66 min in all. */
function resumedRun(): Run {
  const first = must(startRun(sampleRun(), 0));
  const stopped = must(endRun(first, 'Interrupted', 3_132_000));
  const queued = must(reopenRun(stopped, 6_972_000));
  const second = must(startRun(queued, 6_972_000));
  return must(endRun(second, 'Completed', 130 * minute));
}

describe('the spans of a run', () => {
  it('RF-006 keeps the first start when a stopped run is resumed and started again', () => {
    const stopped = must(endRun(must(startRun(sampleRun(), 1_000)), 'Failed', 5_000));

    const queued = must(reopenRun(stopped, 20_000));
    const again = must(startRun(queued, 30_000));

    expect(queued).toMatchObject({ startedAt: 1_000, spanStartedAt: null, activeMs: 4_000 });
    expect(again).toMatchObject({ startedAt: 1_000, spanStartedAt: 30_000, activeMs: 4_000 });
  });

  it('RF-006 does not count the wait for an answer: pausing ends the span, Continue keeps the start', () => {
    const running = must(startRun(sampleRun(), 1_000));
    const paused = must(pauseRun(running, 4_000));

    const queued = must(continueRun(paused, 50_000));
    const again = must(startRun(queued, 60_000));
    const ended = must(endRun(again, 'Completed', 62_000));

    expect(paused).toMatchObject({ startedAt: 1_000, spanStartedAt: null, activeMs: 3_000 });
    expect(queued).toMatchObject({ startedAt: 1_000, activeMs: 3_000 });
    expect(ended).toMatchObject({ startedAt: 1_000, spanStartedAt: null, activeMs: 5_000 });
  });

  it('RF-006 ends a paused run without adding the wait to its running time', () => {
    const paused = must(pauseRun(must(startRun(sampleRun(), 1_000)), 4_000));

    const stopped = must(endRun(paused, 'CapReached', 90_000));

    expect(stopped).toMatchObject({ startedAt: 1_000, endedAt: 90_000, activeMs: 3_000 });
  });

  it('RF-006 a run cancelled in the queue has no running time', () => {
    expect(must(endRun(sampleRun(), 'Interrupted', 9_000))).toMatchObject({ activeMs: 0 });
  });
});

describe('runTimesOf', () => {
  it('RF-1008 gives 66 min of running time and 130 min of wall time for the resumed run of EV-93', () => {
    expect(runTimesOf(resumedRun())).toEqual({ runningMs: 66 * minute, wallMs: 130 * minute });
  });

  it('RF-1008 gives the same figure twice for a run that ran once', () => {
    const run = must(endRun(must(startRun(sampleRun(), 1_000)), 'Completed', 121_000));

    expect(runTimesOf(run)).toEqual({ runningMs: 120_000, wallMs: 120_000 });
  });

  it.each(['queued', 'running', 'never started'] as const)(
    'RF-1008 gives no times for a run that has not ended (%s)',
    (kind) => {
      const queued = sampleRun();
      const run = kind === 'running' ? must(startRun(queued, 1_000)) : queued;

      expect(runTimesOf(run)).toBeNull();
    },
  );

  it('RF-1008 gives no times for a run cancelled before it ever started', () => {
    expect(runTimesOf(must(endRun(sampleRun(), 'Interrupted', 9_000)))).toBeNull();
  });
});
