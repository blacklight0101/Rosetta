import { describe, expect, it } from 'vitest';
import {
  judgeClaims,
  runJudgementStep,
} from '../../../src/application/understand/claim-judgement.js';
import { recordingOf } from '../../support/fake-recordings.js';
import {
  cardsAfterStep1,
  screenDraftWithMadeUpClaims,
} from '../../support/flow-screen-verify-cards.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// RF-626, RF-301, P3-122, HB-02, DEC-18, DEC-19: the derived "Field X is on the screen" claims of a
// screen are decided by the lines they cite when those lines decide them, and every one still ends
// with a verdict. Haiku spent 85-90% of the verifier tokens of a Deepen run on them, one call each.

const at = '2026-10-12T10:00:00.000Z';
const supported = {
  retried: [],
  response: {
    text: 'Reason: The cited lines show it.\nVerdict: Supported',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  },
} as const;

const field = (name: string) => ({ name, inputKind: 'text', required: false, validations: [] });

/** One claim by the agent, one route, and the fields below: NameLabel is on the page, the rest not. */
const draft = {
  ...screenDraftWithMadeUpClaims,
  screen: {
    ...{ route: '/Catalog/Details.aspx', roles: [], leadsTo: [] },
    fields: [field('NameLabel'), field('PriceLabel'), field('StockLabel'), field('***')],
    actions: [],
  },
};

async function judged() {
  const h = await verifierHarness({ recording: recordingOf(supported, supported, supported) });
  const cards = await runJudgementStep(cardsAfterStep1([draft], at), h.step());
  return { h, claims: cards.flatMap((card) => card.claims) };
}

describe('P3-122 screen field claims', () => {
  it('RF-626 a screen of four fields makes one call per claim the lines cannot decide, not one per field', async () => {
    const { h, claims } = await judged();

    // the agent's claim, the route and the field "***": three calls; three fields are decided by rule.
    expect(h.requests()).toHaveLength(3);
    expect(claims.map((claim) => claim.status)).toEqual([
      'Supported',
      'Supported',
      'Supported',
      'Rejected',
      'Rejected',
      'Supported',
    ]);
  });

  it('DEC-18 DEC-19 each decided field has a verdict with a plain reason and no model name', async () => {
    const { claims } = await judged();

    const name = claims.find((claim) => claim.text.startsWith('Field NameLabel'));
    expect(name?.verdict).toMatchObject({ step: 'judgement', model: 'rule' });
    expect(name?.verdict?.reason).toContain('NameLabel');
    expect(claims[3]?.verdict).toMatchObject({ model: 'rule' });
    expect(claims[3]?.verdict?.reason).toBe(
      'The cited lines do not contain the field name PriceLabel.',
    );
  });
});

describe('P3-122 screen field claims in the run log', () => {
  it('RF-1004 the run log counts the claims judged without a model call', async () => {
    const { h } = await judged();

    const ended = h.events.find((event) => event.type === 'verify.judgement.ended');
    expect(ended?.data).toEqual({
      supported: 4,
      rejected: 2,
      unverified: 0,
      notJudged: 0,
      withoutModel: 3,
    });
    expect(h.events.filter((event) => event.type === 'verify.claim.judged')).toHaveLength(6);
  });

  it('RF-301 a Deepen that judges only the field claims calls no model for them', async () => {
    const h = await verifierHarness({ recording: recordingOf() });
    const cards = cardsAfterStep1([draft], at);
    const onlyFields = (claim: { text: string }) => claim.text.startsWith('Field ');

    const result = await judgeClaims(cards, {
      ...h.step(),
      awaits: (claim) => onlyFields(claim) && !claim.text.includes('***'),
    });

    expect(h.requests()).toHaveLength(0);
    expect(result[0]?.claims.filter(onlyFields).map((claim) => claim.status)).toEqual([
      'Supported',
      'Rejected',
      'Rejected',
      'Proposed',
    ]);
  });
});
