import { describe, expect, it } from 'vitest';
import {
  claimsOfThisRun,
  roomCardsOf,
  roomStopReason,
} from '../../../../src/application/deepen/deepen-room.js';
import type { DeepenRecord, DeepenRound } from '../../../../src/domain/deepen/deepen-record.js';
import { DEEPEN_STOP_REASONS } from '../../../../src/domain/deepen/stop-rule.js';
import { cardOf, claimOf } from '../../../support/deepen-fixtures.js';

// RF-429, P5-30, DEC-170: what the room check of a Deepen counts: the claims waiting for judgement
// and the claims this Deepen judged (all its rounds, a resumed one included), never the judged
// claims the parent run left; and how a stop of the readers ends the Deepen.

function round(n: number, partial: Partial<DeepenRound>): DeepenRound {
  return {
    ...{ round: n, complete: true, judged: [], reread: [], failedAreas: [], filesRead: [] },
    ...{ newClaims: [], tokens: 0, costMicros: 0 },
    ...partial,
  };
}

const record = {
  rounds: [
    round(1, { newClaims: [{ claimId: 'BR-003.c1', status: 'Supported' }] }),
    round(2, { judged: ['BR-002.c1'] }),
  ],
} as unknown as DeepenRecord;

describe('claimsOfThisRun', () => {
  it('RF-429 holds the claims written and the claims judged in every round, and those of the plan', () => {
    const ids = claimsOfThisRun(record, ['BR-009.c1']);

    expect([...ids].sort()).toEqual(['BR-002.c1', 'BR-003.c1', 'BR-009.c1']);
  });
});

describe('roomCardsOf', () => {
  const parent = cardOf('A', [
    claimOf('BR-001.c1', 'Supported', ['a.cs']),
    claimOf('BR-002.c1', 'Supported', ['a.cs']),
    claimOf('BR-004.c1', 'Proposed', ['a.cs']),
  ]);
  const own = cardOf('A', [claimOf('BR-003.c1', 'Supported', ['a.cs'])]);

  it('RF-429 keeps the claims waiting and those this Deepen judged, and drops the parent judged ones', () => {
    const kept = roomCardsOf([parent, own], new Set(['BR-002.c1', 'BR-003.c1']));

    expect(kept.flatMap((card) => card.claims.map((claim) => claim.claimId))).toEqual([
      'BR-002.c1',
      'BR-004.c1',
      'BR-003.c1',
    ]);
  });
});

describe('roomStopReason', () => {
  it('RF-429 ends the Deepen with readersStopped when the readers left room to judge', () => {
    expect(roomStopReason('judging')).toBe('readersStopped');
  });

  it('RF-429 ends the Deepen as a cap stop when the readers share is used up', () => {
    expect(roomStopReason('share')).toBe('capReached');
  });

  it('RF-429 adds no stop while the readers may go on', () => {
    expect(roomStopReason(undefined)).toBeUndefined();
  });

  it('RF-429 lists readersStopped among the stop reasons of a Deepen', () => {
    expect(DEEPEN_STOP_REASONS).toContain('readersStopped');
  });
});
