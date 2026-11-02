import { describe, expect, it } from 'vitest';
import {
  nextRoundNumber,
  withRound,
  writtenIn,
  type DeepenRecord,
  type DeepenRound,
} from '../../../../src/domain/deepen/deepen-record.js';

// RF-209, DEC-197, EV-62: a resumed Deepen numbers its round from the complete rounds, and the
// round it runs again replaces the incomplete one, so the events never say round 4 of 3.

function roundOf(round: number, complete: boolean, extra: Partial<DeepenRound> = {}): DeepenRound {
  return {
    ...{ round, complete, judged: [], reread: [], failedAreas: [], filesRead: [] },
    ...{ newClaims: [], answersUsed: [], tokens: 100, costMicros: 0 },
    ...extra,
  };
}

function recordWith(rounds: readonly DeepenRound[]): DeepenRecord {
  return {
    ...{ parentRunId: 'run-1', parentRunKey: '2026-10-29-0001', maxRounds: 3 },
    ...{ coveragePass: false, stopReason: null, outOfScope: [], before: null, after: null },
    rounds,
    roundsDone: rounds.filter((round) => round.complete).length,
  };
}

const capped = recordWith([roundOf(1, true), roundOf(2, true), roundOf(3, false)]);

describe('RF-209 the round number of a resumed Deepen', () => {
  it('RF-209 numbers the next round from the complete rounds, not from every stored round', () => {
    expect(nextRoundNumber(capped)).toBe(3);
    expect(nextRoundNumber(recordWith([]))).toBe(1);
    expect(nextRoundNumber(recordWith([roundOf(1, true)]))).toBe(2);
  });

  it('RF-209 replaces the incomplete round with the round run again, keeping what it had done', () => {
    const cut = recordWith([
      roundOf(1, true),
      roundOf(2, false, { newClaims: [{ claimId: 'BR-004.c1', status: 'Supported' }] }),
    ]);

    const resumed = withRound(
      cut,
      roundOf(2, true, { newClaims: [{ claimId: 'BR-005.c1', status: 'Supported' }] }),
    );

    expect(resumed.rounds.map((round) => [round.round, round.complete])).toEqual([
      [1, true],
      [2, true],
    ]);
    expect(resumed.roundsDone).toBe(2);
    expect(resumed.rounds[1]?.tokens).toBe(200);
    expect([...writtenIn(resumed)].sort()).toEqual(['BR-004.c1', 'BR-005.c1']);
  });

  it('RF-209 counts the third round of three as the last after the resume', () => {
    const resumed = withRound(capped, roundOf(nextRoundNumber(capped), true));

    expect(resumed.rounds.map((round) => round.round)).toEqual([1, 2, 3]);
    expect(resumed.roundsDone).toBe(resumed.maxRounds);
  });

  it('RF-209 appends a round whose number no stored round has', () => {
    const next = withRound(recordWith([roundOf(1, true)]), roundOf(2, false));

    expect(next.rounds.map((round) => [round.round, round.complete])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(next.roundsDone).toBe(1);
  });
});
