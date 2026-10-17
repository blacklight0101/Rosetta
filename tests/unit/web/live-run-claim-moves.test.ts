import { describe, expect, it } from 'vitest';
import { cardProposed, citationChecked, ev, stateAfter } from './live-run-fixtures.js';

// RF-1004, RF-250: when cards merge, the claims of the run page follow their new ids and keep
// their verdicts; nothing is lost and nothing lands on another claim.

const rejected = (seq: number, claimId: string) =>
  ev(seq, 'verify.claim.judged', { claimId, status: 'Rejected', reason: 'no' }, 'reader-002');

const merge = (seq: number, claims: readonly { from: string; to: string }[]) =>
  ev(seq, 'cards.merged', { cardId: 'ENT-001', from: ['ENT-001', 'ENT-002'], claims });

const rowsOf = (state: ReturnType<typeof stateAfter>) =>
  state.claims.map((claim) => [claim.claimId, claim.cardId, claim.status]);

describe('the run page and the claim moves', () => {
  it('RF-250 a verdict stays on its claim, which takes the merged id', () => {
    const state = stateAfter(
      cardProposed(1, 'reader-001', 'ENT-001'),
      cardProposed(2, 'reader-002', 'ENT-002'),
      citationChecked(3, 'reader-002', 'ENT-002.c1', true),
      rejected(4, 'ENT-002.c1'),
      merge(5, [{ from: 'ENT-002.c1', to: 'ENT-001.c2' }]),
    );

    expect(rowsOf(state)).toEqual([
      ['ENT-001.c1', 'ENT-001', 'Proposed'],
      ['ENT-001.c2', 'ENT-001', 'Rejected'],
    ]);
    expect(state.claims[1]).toMatchObject({ text: 'Claim ENT-002.c1', reason: 'no' });
  });

  it('RF-250 a verdict after the merge lands on the claim it names', () => {
    const state = stateAfter(
      cardProposed(1, 'reader-001', 'ENT-001'),
      cardProposed(2, 'reader-002', 'ENT-002'),
      merge(3, [{ from: 'ENT-002.c1', to: 'ENT-001.c2' }]),
      rejected(4, 'ENT-001.c2'),
    );

    expect(rowsOf(state)).toEqual([
      ['ENT-001.c1', 'ENT-001', 'Proposed'],
      ['ENT-001.c2', 'ENT-001', 'Rejected'],
    ]);
  });
});

describe('the run page and the claim moves that need care', () => {
  it('RF-250 moves that swap ids apply together', () => {
    const state = stateAfter(
      cardProposed(1, 'reader-001', 'ENT-001', 2),
      rejected(2, 'ENT-001.c1'),
      merge(3, [
        { from: 'ENT-001.c1', to: 'ENT-001.c2' },
        { from: 'ENT-001.c2', to: 'ENT-001.c1' },
      ]),
    );

    expect(rowsOf(state)).toEqual([
      ['ENT-001.c2', 'ENT-001', 'Rejected'],
      ['ENT-001.c1', 'ENT-001', 'Proposed'],
    ]);
  });

  it('RF-1004 a merge event with damaged data changes no claim', () => {
    const state = stateAfter(
      cardProposed(1, 'reader-001', 'ENT-001'),
      ev(2, 'cards.merged', { claims: 'no' }),
    );

    expect(rowsOf(state)).toEqual([['ENT-001.c1', 'ENT-001', 'Proposed']]);
  });
});
