import { describe, expect, it } from 'vitest';
import { createCard } from '../../../../src/domain/cards/card.js';
import { screenDraft, validScreen } from '../../../support/flow-screen-fixtures.js';

// RF-261, RF-626, ADR-005, owner decision 2026-10-18: the route, the roles, the fields and the
// links of a screen are claims of its card, like its validations and actions, so the verifier
// judges each one before it reaches the planner or a wireframe.

const ids = { id: 'SCRN-001', agentTaskId: 't' };
const page = 'src/Web/Checkout.aspx';

function claimsOf(screen = validScreen) {
  const card = createCard({ ...screenDraft(screen), ...ids });
  if (!card.ok) throw new Error('fixture');
  return card.value.claims;
}

describe('the claims of a SCRN card: route, roles, fields and links', () => {
  it('RF-626 states the route, each role, each field and each link as a claim, after the actions', () => {
    const texts = claimsOf().map((claim) => claim.text);

    expect(texts.slice(4)).toEqual([
      'The screen is at the route /Checkout.aspx.',
      'The role Customer can open the screen.',
      'Field Email (text, required) is on the screen.',
      'The screen leads to /Confirmation.aspx.',
    ]);
  });

  it('RF-626 each of them cites the lines of the claims the agent wrote for the screen', () => {
    const written = { path: page, startLine: 1, endLine: 3 };
    const draft = screenDraft();
    const card = createCard({
      ...draft,
      ...ids,
      claims: [{ text: 'The page is served.', citations: [written] }],
    });

    const derived = card.ok ? card.value.claims.slice(4) : [];
    expect(derived).toHaveLength(4);
    expect(derived.map((claim) => claim.citations)).toEqual(Array(4).fill([written]));
  });
});

describe('the claims of a SCRN card: numbering and the bare screen', () => {
  it('RF-626 an optional field says optional, and every claim starts Proposed with a numbered id', () => {
    const screen = {
      ...validScreen,
      fields: [{ name: 'Note', inputKind: 'text', required: false, validations: [] }],
    };

    const claims = claimsOf(screen);

    expect(claims.map((claim) => claim.text)).toContain(
      'Field Note (text, optional) is on the screen.',
    );
    expect(claims.map((claim) => claim.claimId)).toEqual(
      claims.map((_, index) => `SCRN-001.c${String(index + 1)}`),
    );
    expect(claims.every((claim) => claim.status === 'Proposed')).toBe(true);
  });

  it('RF-626 a screen with no roles, fields, actions or links adds only the claim of its route', () => {
    const bare = { ...validScreen, roles: [], fields: [], actions: [], leadsTo: [] };

    expect(claimsOf(bare).map((claim) => claim.text)).toEqual([
      'Checkout creates an order from the basket.',
      'The screen is at the route /Checkout.aspx.',
    ]);
  });
});
