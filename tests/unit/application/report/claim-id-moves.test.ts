import { describe, expect, it } from 'vitest';
import { buildReplay } from '../../../../src/application/report/replay-timeline.js';
import type { RunEvent } from '../../../../src/domain/runs/run-event.js';

// RF-506, RF-250, RF-1004: the replay shows each verdict on the claim as the merged card numbers
// it; an event after the merge already uses the new id; a log without a merge event is unchanged.

const runId = '20261012-100000-understand';

function event(seq: number, type: string, data: Record<string, unknown>): RunEvent {
  const at = `2026-10-12T10:00:${String(seq).padStart(2, '0')}.000Z`;
  return { schemaVersion: 1, seq, at, runId, type, data };
}

const judged = (seq: number, claimId: string) =>
  event(seq, 'verify.claim.judged', { claimId, status: 'Rejected', reason: 'no' });
const checked = (seq: number, claimId: string) =>
  event(seq, 'verify.citation.checked', { claimId, ok: true });
const merged = (seq: number, cardId: string, from: string, to: string) =>
  event(seq, 'cards.merged', {
    cardId,
    from: [cardId, from.split('.').at(0) ?? ''],
    claims: [{ from, to }],
  });

const texts = (events: readonly RunEvent[]) =>
  buildReplay(runId, events).steps.map((step) => step.text);

describe('the replay and the claim moves', () => {
  it('RF-250 a verdict given before the merge shows the new claim id', () => {
    const steps = texts([
      checked(1, 'ENT-002.c1'),
      judged(2, 'ENT-002.c1'),
      merged(3, 'ENT-001', 'ENT-002.c1', 'ENT-001.c2'),
    ]);

    expect(steps[0]).toBe('ENT-001.c2: citation ok');
    expect(steps[1]).toBe('ENT-001.c2: Rejected - no');
  });

  it('RF-250 a verdict given after the merge keeps its id', () => {
    const steps = texts([
      merged(1, 'ENT-001', 'ENT-002.c1', 'ENT-001.c2'),
      judged(2, 'ENT-002.c1'),
    ]);

    expect(steps[1]).toBe('ENT-002.c1: Rejected - no');
  });

  it('RF-250 the merge is a step of its own', () => {
    const replay = buildReplay(runId, [merged(1, 'ENT-001', 'ENT-002.c1', 'ENT-001.c2')]);

    expect(replay.steps.map((step) => [step.label, step.text])).toEqual([
      ['Cards merged', 'ENT-001, ENT-002 into ENT-001 (1 claim renumbered)'],
    ]);
  });
});

describe('the replay and the claim moves of a log', () => {
  it('RF-250 two merges in a row carry a claim through both', () => {
    const steps = texts([
      judged(1, 'ENT-003.c1'),
      merged(2, 'ENT-002', 'ENT-003.c1', 'ENT-002.c2'),
      merged(3, 'ENT-001', 'ENT-002.c2', 'ENT-001.c3'),
    ]);

    expect(steps[0]).toBe('ENT-001.c3: Rejected - no');
  });

  it('RF-1004 a log recorded before merges were announced replays as it was', () => {
    const steps = texts([checked(1, 'ENT-002.c1'), judged(2, 'ENT-002.c1')]);

    expect(steps).toEqual(['ENT-002.c1: citation ok', 'ENT-002.c1: Rejected - no']);
  });

  it('RF-1004 a merge event with damaged data is left out and changes no id', () => {
    const steps = texts([judged(1, 'ENT-002.c1'), event(2, 'cards.merged', { claims: 'no' })]);

    expect(steps).toEqual(['ENT-002.c1: Rejected - no']);
  });
});

describe('the replay and the claim moves that need care', () => {
  it('RF-250 moves that swap ids apply together', () => {
    const swap = event(3, 'cards.merged', {
      cardId: 'ENT-001',
      from: ['ENT-001', 'ENT-002'],
      claims: [
        { from: 'ENT-001.c1', to: 'ENT-001.c2' },
        { from: 'ENT-001.c2', to: 'ENT-001.c1' },
      ],
    });

    const steps = texts([judged(1, 'ENT-001.c1'), checked(2, 'ENT-001.c2'), swap]);

    expect(steps.slice(0, 2)).toEqual(['ENT-001.c2: Rejected - no', 'ENT-001.c1: citation ok']);
  });

  it('RF-250 a merge that names ids the log never used changes no other id', () => {
    const steps = texts([
      judged(1, 'ENT-002.c1'),
      merged(2, 'ENT-001', 'ENT-009.c4', 'ENT-001.c7'),
    ]);

    expect(steps[0]).toBe('ENT-002.c1: Rejected - no');
  });
});
