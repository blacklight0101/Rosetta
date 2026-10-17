import { describe, expect, it } from 'vitest';
import { createCard } from '../../../../src/domain/cards/card.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { flowDraft, screenDraft, validScreen } from '../../../support/flow-screen-fixtures.js';

// RF-261, RF-300, RF-301, ADR-005, DEC-134: every validation and every action of a screen is a
// claim of its card, so both verifier steps check it like any other claim.

const ids = { id: 'SCRN-001', agentTaskId: 't' };
const page = 'src/Web/Checkout.aspx';

function claimsOf(draft = screenDraft()) {
  const card = createCard({ ...draft, ...ids });
  if (!card.ok) throw new Error('fixture');
  return card.value.claims;
}

describe('the claims of a SCRN card', () => {
  it('RF-261 a validation of a field is a claim that cites the validation lines, after the agent claims', () => {
    const claims = claimsOf();

    expect(claims[0]?.text).toBe('Checkout creates an order from the basket.');
    expect(claims[1]).toEqual({
      claimId: 'SCRN-001.c2',
      text: 'Field Email (text, required) validation: Must be an e-mail address.',
      citations: [{ path: page, startLine: 12, endLine: 14 }],
      status: 'Proposed',
    });
  });

  it('RF-261 an action is a claim that cites the lines of the claims the agent wrote for the screen', () => {
    const claims = claimsOf();

    expect(claims[2]?.text).toBe('Action Pay starts the handler PayButton_Click.');
    expect(claims[2]?.citations).toEqual(claims[0]?.citations);
    expect(claims[3]?.text).toBe('Action Back starts the flow FLOW-001.');
  });

  it('RF-261 claim ids run on without a gap: agent claims, then validations, then actions', () => {
    expect(claimsOf().map((claim) => claim.claimId)).toEqual([
      'SCRN-001.c1',
      'SCRN-001.c2',
      'SCRN-001.c3',
      'SCRN-001.c4',
    ]);
  });
});

describe('the claims of a SCRN card: what is left out', () => {
  it('RF-261 a screen without validations or actions has only the claims the agent wrote', () => {
    const screen = { ...validScreen, fields: [], actions: [] };

    expect(claimsOf(screenDraft(screen))).toHaveLength(1);
  });

  it('RF-261 lines cited twice by the screen claims are cited once by an action', () => {
    const first = { path: page, startLine: 1, endLine: 3 };
    const second = { path: page, startLine: 5, endLine: 6 };
    const claims = [
      { text: 'One.', citations: [first] },
      { text: 'Two.', citations: [first, second] },
    ];

    const action = claimsOf({ ...screenDraft(), claims })[4];

    expect(action?.text).toBe('Action Pay starts the handler PayButton_Click.');
    expect(action?.citations).toEqual([first, second]);
  });

  it('RF-260 a FLOW card keeps one claim per step and a FEAT card adds none', () => {
    const flow = createCard({ ...flowDraft(), id: 'FLOW-001', agentTaskId: 't' });
    const feat = createCard({
      ...draftOf({ screen: validScreen }),
      id: 'FEAT-001',
      agentTaskId: 't',
    });

    expect(flow.ok && flow.value.claims).toHaveLength(1);
    expect(feat.ok && feat.value.claims).toHaveLength(1);
  });
});
