import { describe, expect, it } from 'vitest';
import { scoreCase, scoreClaims } from '../../../../src/domain/eval/claim-score.js';
import { absence, claim, finding, goldenCase } from '../../../support/eval-fixtures.js';

// RNF-006, RNF-015, RFC-001 section 7: the precision of `Supported` claims and the recall of the
// golden rules, for one run. Only `Supported` claims count; a claim that states something the
// golden set says is not in the code is wrong, a claim that matches a finding is correct, and any
// other is unmatched and listed for a person to check.

const price = finding({ id: 'rule-price', keywords: ['price'] });
const stock = finding({
  id: 'rule-stock',
  evidence: ['Models/Item.cs:40-45'],
  keywords: ['stock'],
});
const item = finding({ id: 'entity-item', kind: 'entity', keywords: ['item'] });
const reorder = absence();

describe('scoring the claims of a run', () => {
  it('RNF-006 counts correct, wrong and unmatched Supported claims and the rules found', () => {
    const score = scoreClaims(
      [
        claim({ claimId: 'BR-001.c1', cardTitle: 'Price', text: 'The price has two decimals.' }),
        claim({ claimId: 'BR-002.c1', text: 'An automatic reorder runs at night.' }),
        claim({ claimId: 'BR-003.c1', text: 'Something else.', citations: ['Other.cs:1-2'] }),
        claim({ claimId: 'BR-004.c1', text: 'The stock rule.', status: 'Rejected' }),
      ],
      [price, stock, item],
      [reorder],
    );

    expect(score).toMatchObject({
      supported: 3,
      correct: 1,
      incorrect: 1,
      unmatched: 1,
      precision: 0.5,
      strictPrecision: 0.333333,
      rulesTotal: 2,
      rulesFound: 1,
      recall: 0.5,
      findingsTotal: 3,
      findingsFound: 1,
      recallAll: 0.333333,
      foundFindings: ['rule-price'],
      missedFindings: ['entity-item', 'rule-stock'],
      absencesHit: ['absent-auto-reorder'],
      incorrectClaims: ['BR-002.c1'],
      unmatchedClaims: ['BR-003.c1'],
    });
  });
});

describe('scoring the claims of a run: edge cases', () => {
  it('RNF-006 gives no ratio when there is nothing to divide by', () => {
    const score = scoreClaims([], [], []);

    expect(score).toMatchObject({
      supported: 0,
      precision: null,
      strictPrecision: null,
      recall: null,
      recallAll: null,
    });
  });

  it('RNF-006 scores a run whose every Supported claim is wrong at zero', () => {
    const wrong = [
      claim({ claimId: 'FEAT-001.c1', text: 'An automatic reorder happens.' }),
      claim({ claimId: 'FEAT-001.c2', text: 'The automatic reorder emails.' }),
    ];
    const score = scoreClaims(wrong, [price], [reorder]);

    expect(score).toMatchObject({ correct: 0, incorrect: 2, precision: 0, recall: 0 });
  });

  it('RNF-015 counts a claim that matches a finding and states an absence as wrong, and finds nothing with it', () => {
    const both = claim({ text: 'The price triggers an automatic reorder.' });
    const score = scoreClaims([both], [price], [reorder]);

    expect(score).toMatchObject({ correct: 0, incorrect: 1, rulesFound: 0, recall: 0 });
  });
});

describe('scoring the claims of a run: ties and order', () => {
  it('RNF-006 counts a claim that matches two findings once, and both findings as found', () => {
    const score = scoreClaims([claim({ text: 'The item price.' })], [price, item], []);

    expect(score).toMatchObject({ supported: 1, correct: 1, findingsFound: 2, recall: 1 });
  });

  it('RNF-006 lists ids in code-unit order whatever the order of the input', () => {
    const score = scoreClaims(
      [claim({ claimId: 'Z-1.c1', text: 'x' }), claim({ claimId: 'A-1.c1', text: 'y' })],
      [stock, price],
      [],
    );

    expect(score.unmatchedClaims).toEqual(['A-1.c1', 'Z-1.c1']);
    expect(score.missedFindings).toEqual(['rule-price', 'rule-stock']);
  });

  it('RNF-006 scores a case with only the claims that cite one of its paths', () => {
    const elsewhere = claim({
      claimId: 'BR-009.c1',
      text: 'An automatic reorder.',
      citations: ['Services/Store.cs:1-3'],
    });
    const score = scoreCase([claim(), elsewhere], goldenCase());

    expect(score).toMatchObject({ caseId: 'catalog-item', supported: 1, correct: 1, incorrect: 0 });
  });
});
