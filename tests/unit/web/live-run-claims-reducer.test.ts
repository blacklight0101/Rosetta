import { describe, expect, it } from 'vitest';
import { applyEvent } from '../../../web/src/lib/live-run/reduce-run.js';
import { claimCounts } from '../../../web/src/lib/live-run/run-summary.js';
import { cardProposed, citationChecked, ev, planned, stateAfter } from './live-run-fixtures.js';

// RF-1002, RF-1003, RF-424, RF-1004, DEC-103: the events of a run folded into the page state.

describe('the claims', () => {
  it('RF-1004 lists the claims of a proposed card as proposed, by their ids', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      cardProposed(2, 'reader-001', 'BR-001', 2),
    );

    expect(state.claims.map((claim) => [claim.claimId, claim.cardId, claim.status])).toEqual([
      ['BR-001.c1', 'BR-001', 'Proposed'],
      ['BR-001.c2', 'BR-001', 'Proposed'],
    ]);
  });

  it('RF-1004 DEC-103 marks a claim that passed the citation check as awaiting model verification', () => {
    const state = stateAfter(
      cardProposed(1, 'reader-001', 'BR-001'),
      citationChecked(2, 'reader-001', 'BR-001.c1', true),
    );

    expect(state.claims[0]).toEqual({
      claimId: 'BR-001.c1',
      cardId: 'BR-001',
      text: 'Claim BR-001.c1',
      citations: [{ path: 'Catalog/Edit.aspx.cs', startLine: 40, endLine: 80 }],
      status: 'AwaitingModel',
      reason: undefined,
    });
  });

  it('RF-1004 marks a claim whose citation failed as invalid, with the reason', () => {
    const state = stateAfter(
      cardProposed(1, 'reader-001', 'BR-001'),
      citationChecked(2, 'reader-001', 'BR-001.c1', 'line 140 is past the end of the file'),
    );

    expect(state.claims[0]).toMatchObject({
      status: 'CitationInvalid',
      reason: 'line 140 is past the end of the file',
    });
  });
});

describe('the verdicts', () => {
  it('RF-1004 changes the status of a claim when the verdict arrives, with its reason', () => {
    const checked = stateAfter(
      cardProposed(1, 'reader-001', 'BR-001', 2),
      citationChecked(2, 'reader-001', 'BR-001.c1', true),
      citationChecked(3, 'reader-001', 'BR-001.c2', true),
    );

    const judged = applyEvent(
      applyEvent(
        checked,
        ev(4, 'verify.claim.judged', {
          claimId: 'BR-001.c1',
          status: 'Supported',
          reason: 'the lines set the price',
        }),
      ),
      ev(5, 'verify.claim.judged', {
        claimId: 'BR-001.c2',
        status: 'Rejected',
        reason: 'they do not',
      }),
    );

    expect(judged.claims.map((claim) => [claim.status, claim.reason])).toEqual([
      ['Supported', 'the lines set the price'],
      ['Rejected', 'they do not'],
    ]);
    expect(claimCounts(judged.claims)).toEqual({ Supported: 1, Rejected: 1 });
  });

  it('RF-1004 keeps a claim whose card event the page missed, and ignores a verdict it does not know', () => {
    const state = stateAfter(
      citationChecked(1, 'reader-001', 'FEAT-004.c2', true),
      ev(2, 'verify.claim.judged', { claimId: 'FEAT-004.c2', status: 'Maybe', reason: 'x' }),
    );

    expect(state.claims.map((claim) => [claim.claimId, claim.cardId, claim.status])).toEqual([
      ['FEAT-004.c2', 'FEAT-004', 'AwaitingModel'],
    ]);
  });
});
