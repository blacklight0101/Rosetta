import { describe, expect, it } from 'vitest';
import { buildReplay } from '../../../../src/application/report/replay-timeline.js';
import type { RunEvent } from '../../../../src/domain/runs/run-event.js';

// RF-506, RF-241, RF-1007: the replay shows a question the re-run answered and one it left out,
// with the reason; data that does not fit the event gives no step.

const runId = '20261012-100000-understand';

function event(seq: number, type: string, data: Record<string, unknown>): RunEvent {
  const at = `2026-10-12T10:00:${String(seq).padStart(2, '0')}.000Z`;
  return { schemaVersion: 1, seq, at, runId, type, data };
}

describe('the replay and the questions of a re-run', () => {
  it('RF-241 RF-506 shows a skipped question with its card, run and reason', () => {
    const steps = buildReplay(runId, [
      event(1, 'question.skipped', {
        cardId: 'OQ-002',
        runKey: '20261010-090000-understand',
        reason: 'already-answered',
      }),
    ]).steps;

    expect(steps).toMatchObject([
      {
        kind: 'question',
        label: 'Question skipped',
        text: 'OQ-002 of 20261010-090000-understand: already-answered',
      },
    ]);
  });

  it('RF-241 RF-506 leaves out a skipped event whose data does not fit', () => {
    const steps = buildReplay(runId, [event(1, 'question.skipped', { cardId: 7 })]).steps;

    expect(steps).toEqual([]);
  });
});
