import { describe, expect, it } from 'vitest';
import type { ClaimStatus } from '../../../../src/domain/cards/card-vocabulary.js';
import { scoreClaims } from '../../../../src/domain/eval/claim-score.js';
import { claim, finding } from '../../../support/eval-fixtures.js';

// RF-260, RF-261, RF-262, RNF-006, RFC-001 section 7: the three measures of the flows, screens and
// data model next to the existing ones: the recall of the steps of the golden flows, the recall of
// the fields of the golden screens, and the precision of the relations the entity cards state.

const steps = [
  finding({
    id: 'step-list',
    kind: 'step',
    of: 'Browse',
    cardTypes: ['FLOW'],
    evidence: ['Default.aspx.cs:9-12'],
    keywords: ['binds'],
  }),
  finding({
    id: 'step-search',
    kind: 'step',
    of: 'Browse',
    cardTypes: ['FLOW'],
    evidence: ['Default.aspx.cs:14-17'],
    keywords: ['search'],
  }),
  finding({
    id: 'step-details',
    kind: 'step',
    of: 'Browse',
    cardTypes: ['FLOW'],
    evidence: ['Default.aspx.cs:19-22'],
    keywords: ['details'],
  }),
];

function flowStep(id: string, text: string, citation: string, status: ClaimStatus = 'Supported') {
  return claim({
    claimId: id,
    cardType: 'FLOW',
    cardTitle: 'Browse the catalogue',
    text,
    status,
    citations: [citation],
  });
}

describe('the recall of the steps of the golden flows', () => {
  it('RF-260 counts the golden steps that a Supported FLOW claim found', () => {
    const claims = [
      flowStep('FLOW-001.c1', 'The page binds the grid.', 'Default.aspx.cs:9-12'),
      flowStep('FLOW-001.c2', 'Search binds it again.', 'Default.aspx.cs:14-17'),
    ];
    const score = scoreClaims(claims, steps, []);

    expect(score).toMatchObject({ stepsTotal: 3, stepsFound: 2, stepRecall: 0.666667 });
    expect(score.missedFindings).toEqual(['step-details']);
  });

  it('RF-260 does not count a claim that is not Supported or sits on another card type', () => {
    const claims = [
      flowStep('FLOW-001.c1', 'The page binds the grid.', 'Default.aspx.cs:9-12', 'Rejected'),
      claim({
        claimId: 'FEAT-001.c1',
        cardType: 'FEAT',
        text: 'Search binds the grid.',
        citations: ['Default.aspx.cs:14-17'],
      }),
    ];

    expect(scoreClaims(claims, steps, [])).toMatchObject({ stepsFound: 0, stepRecall: 0 });
  });

  it('RF-260 has no recall when the golden set holds no step', () => {
    expect(scoreClaims([], [finding()], [])).toMatchObject({ stepsTotal: 0, stepRecall: null });
  });
});

const fields = [
  finding({
    id: 'field-email',
    kind: 'field',
    of: 'Checkout',
    cardTypes: ['SCRN'],
    evidence: ['Orders/Checkout.aspx:5-7'],
    keywords: ['e-mail'],
  }),
  finding({
    id: 'field-shipping',
    kind: 'field',
    of: 'Checkout',
    cardTypes: ['SCRN'],
    evidence: ['Orders/Checkout.aspx:8-8'],
    keywords: ['shipping'],
  }),
  finding({
    id: 'action-place',
    kind: 'action',
    of: 'Checkout',
    cardTypes: ['SCRN'],
    evidence: ['Orders/Checkout.aspx:9-9'],
    keywords: ['place order'],
  }),
];

describe('the recall of the fields of the golden screens', () => {
  it('RF-261 counts the golden fields found, and leaves the actions out of it', () => {
    const claims = [
      claim({
        claimId: 'SCRN-001.c1',
        cardType: 'SCRN',
        cardTitle: 'Checkout',
        text: 'The page has an e-mail box and a Place order button.',
        citations: ['Orders/Checkout.aspx:5-9'],
      }),
    ];
    const score = scoreClaims(claims, fields, []);

    expect(score).toMatchObject({ fieldsTotal: 2, fieldsFound: 1, screenFieldRecall: 0.5 });
    expect(score.foundFindings).toEqual(['action-place', 'field-email']);
    expect(score.missedFindings).toEqual(['field-shipping']);
  });
});

const relations = [
  finding({
    id: 'relation-line-item',
    kind: 'relation',
    of: 'Basket line',
    cardTypes: ['ENT'],
    evidence: ['Services/OrderService.cs:9-10'],
    keywords: ['item'],
  }),
];

function entity(id: string, text: string, citation: string, status = 'Supported' as const) {
  return claim({
    claimId: id,
    cardType: 'ENT',
    cardTitle: 'Basket line',
    text,
    status,
    citations: [citation],
  });
}

describe('the precision of the relations the entity cards state', () => {
  it('RF-262 divides the relations that match the golden set by the relations stated', () => {
    const claims = [
      entity(
        'ENT-001.c1',
        'A basket line refers to a catalog item.',
        'Services/OrderService.cs:9-10',
      ),
      entity(
        'ENT-001.c2',
        'A basket line belongs to a customer.',
        'Services/OrderService.cs:14-18',
      ),
      entity('ENT-001.c3', 'A basket line has a quantity.', 'Services/OrderService.cs:9-10'),
    ];
    const score = scoreClaims(claims, relations, []);

    expect(score).toMatchObject({
      relationsStated: 2,
      relationsCorrect: 1,
      relationPrecision: 0.5,
    });
    expect(score.relationClaims).toEqual(['ENT-001.c1', 'ENT-001.c2']);
  });

  it('RF-262 does not count a relation claim that matches an entity of the golden set only', () => {
    const entities = [
      finding({
        id: 'entity-basket-line',
        kind: 'entity',
        cardTypes: ['ENT'],
        evidence: ['Services/OrderService.cs:9-10'],
        keywords: ['basket line'],
      }),
    ];
    const text = 'A basket line refers to a catalog item.';
    const claims = [entity('ENT-001.c1', text, 'Services/OrderService.cs:9-10')];

    expect(scoreClaims(claims, entities, [])).toMatchObject({
      relationsStated: 1,
      relationsCorrect: 0,
      relationPrecision: 0,
    });
  });
});

describe('the relation words', () => {
  it('RF-262 reads the relation words as whole words, in any of their forms', () => {
    const text = 'Each line references one item through a foreign key.';
    const score = scoreClaims(
      [entity('ENT-001.c1', text, 'Services/OrderService.cs:9-10')],
      relations,
      [],
    );

    expect(score).toMatchObject({ relationsStated: 1, relationsCorrect: 1 });
  });

  it('RF-262 ignores claims that are not Supported, not on an ENT card or that state no relation', () => {
    const claims = [
      entity(
        'ENT-001.c1',
        'A line refers to an item.',
        'Services/OrderService.cs:9-10',
        'Rejected',
      ),
      claim({ claimId: 'BR-001.c1', cardType: 'BR', text: 'A line refers to an item.' }),
    ];

    expect(scoreClaims(claims, relations, [])).toMatchObject({
      relationsStated: 0,
      relationPrecision: null,
    });
  });
});

describe('the measures that were there before', () => {
  it('RNF-006 keeps the recall of every finding to features, rules and entities', () => {
    const base = finding({ id: 'rule-price' });
    const claims = [flowStep('FLOW-001.c1', 'The page binds the grid.', 'Default.aspx.cs:9-12')];
    const score = scoreClaims(claims, [base, ...steps], []);

    expect(score).toMatchObject({
      findingsTotal: 1,
      findingsFound: 0,
      recallAll: 0,
      stepsFound: 1,
    });
    expect(score).toMatchObject({ correct: 1, unmatched: 0 });
  });
});
