import { describe, expect, it } from 'vitest';
import { reopenManifest, endManifest } from '../../../../src/domain/runs/run-manifest.js';
import { RESUMABLE_END_STATES, reopenRun } from '../../../../src/domain/runs/run.js';
import { isUnfinishedTask } from '../../../../src/domain/runs/run-states.js';
import { runningRun, sampleManifest, sampleRun } from '../../../support/run-fixtures.js';

// RF-006, RF-304, ADR-007, DEC-13: a run that stopped at a cap, failed or was interrupted queues
// again as the same run; a run that completed, or has not ended, cannot; the manifest forgets the
// end and takes the caps now in force.

const endedAt = 9_000;

function endedRun(endState: 'Completed' | 'CapReached' | 'Failed' | 'Interrupted') {
  return sampleRun({
    queueState: 'Ended',
    endState,
    startedAt: 5_000,
    endedAt,
    totals: { costMicros: 120, inputTokens: 1000, outputTokens: 50, cachedInputTokens: 0 },
  });
}

describe('reopenRun', () => {
  it.each(RESUMABLE_END_STATES)(
    'RF-006 queues a run that ended %s again at the end of the queue, its totals kept',
    (endState) => {
      const ended = endedRun(endState);

      const reopened = reopenRun(ended, 20_000);

      expect(reopened).toEqual({
        ok: true,
        value: {
          ...ended,
          queueState: 'Queued',
          endState: null,
          queuedAt: 20_000,
          startedAt: null,
          endedAt: null,
        },
      });
    },
  );

  it('RF-006 lists exactly the cap, failure and interruption as the states a resume starts from', () => {
    expect([...RESUMABLE_END_STATES]).toEqual(['CapReached', 'Failed', 'Interrupted']);
  });

  it('RF-006 refuses a run that completed: nothing is left to resume', () => {
    expect(reopenRun(endedRun('Completed'), 20_000)).toEqual({
      ok: false,
      error: 'not-resumable',
    });
  });

  it.each([sampleRun(), runningRun()])(
    'RF-006 refuses a run that has not ended (%#)',
    (unfinished) => {
      expect(reopenRun(unfinished, 20_000)).toEqual({ ok: false, error: 'not-resumable' });
    },
  );
});

describe('reopenManifest', () => {
  const caps = { run: { maxCostMicros: 9_000_000, maxTokens: 8_000_000 }, roles: {} };

  it('RF-006 clears the start and the end and takes the caps now in force, keeping the rest', () => {
    const ended = endManifest(
      sampleManifest({
        startedAt: '2026-10-12T10:00:00.000Z',
        totals: { inputTokens: 5, outputTokens: 6, cachedInputTokens: 0, costMicros: 7, calls: 2 },
        agentTasks: [
          {
            agentTaskId: 'reader-001',
            area: 'a',
            role: 'reader',
            state: 'Done',
            turns: 1,
            cards: 1,
          },
        ],
      }),
      'CapReached',
      '2026-10-12T10:05:00.000Z',
    );
    if (!ended.ok) throw new Error('The manifest did not end');

    const reopened = reopenManifest(ended.value, caps);

    expect(reopened).toEqual({
      ok: true,
      value: { ...ended.value, startedAt: null, endedAt: null, endState: null, caps },
    });
  });

  it('RF-006 refuses a manifest that has not ended', () => {
    expect(reopenManifest(sampleManifest(), caps)).toEqual({ ok: false, error: 'not-ended' });
  });
});

describe('isUnfinishedTask', () => {
  it.each(['Planned', 'Running', 'StoppedByCap', 'Failed'])(
    'RF-006 runs a task that is %s again',
    (state) => {
      expect(isUnfinishedTask(state)).toBe(true);
    },
  );

  it.each(['Done', 'TurnLimitReached', 'InvalidOutput'])(
    'RF-006 keeps a task that ended %s: it gave all it will give',
    (state) => {
      expect(isUnfinishedTask(state)).toBe(false);
    },
  );
});
