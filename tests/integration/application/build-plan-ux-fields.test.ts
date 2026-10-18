import { describe, expect, it } from 'vitest';
import { customerCard, flowCard, planCards } from '../../support/plan-cards.js';
import { orderScreenCards, screenCard } from '../../support/plan-screen-cards.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-626, ADR-005, ADR-008, owner decision 2026-10-18: a screen's fields are checked like its
// actions. Only a supported field reaches the planner message and the wireframe; a screen whose
// fields are all unsupported still appears, saying "fields not confirmed"; a header-only legacy
// card shows its fields as "not checked" and sends none to the planner.

const temp = useTempRoot('rosetta-ux-fields-');

function cardsWith(...replaced: ReturnType<typeof screenCard>[]) {
  const ids = new Set(replaced.map((card) => card.id));
  return [
    ...planCards(),
    customerCard(),
    flowCard(),
    ...orderScreenCards().filter((card) => !ids.has(card.id)),
    ...replaced,
  ];
}

const checked = screenCard({
  ...{ id: 'SCRN-001', title: 'Orders list', route: '/orders' },
  fields: [{ name: 'Search' }, { name: 'Smuggled', status: 'Rejected' }],
});
const legacy = screenCard({
  ...{ id: 'SCRN-002', title: 'Order detail', route: '/orders/detail' },
  fields: [{ name: 'Old order number' }],
  legacy: true,
});
const refused = screenCard({
  ...{ id: 'SCRN-003', title: 'Checkout', route: '/checkout' },
  fields: [{ name: 'Hidden', status: 'Rejected' }],
});

async function planned() {
  const h = await seededUxPlan(temp.path, { cards: cardsWith(checked, legacy, refused) });
  const run = await h.plan();
  const request = h.providers.requests()[5];
  const message = request?.messages.map((each) => each.content).join('\n') ?? '';
  return { message, written: await h.handoffOf(run) };
}

describe('BuildPlan: screen fields are checked', () => {
  it('RF-626 ADR-005 a supported field is in the planner message and the wireframe, a rejected one is in neither', async () => {
    const { message, written } = await planned();

    expect(message).toContain('"name": "Search"');
    expect(written['ux/wireframes/SCRN-001.html']).toContain('Search (text, optional)');
    for (const out of ['Smuggled', 'Hidden']) {
      expect(message).not.toContain(out);
      for (const html of Object.values(written)) expect(html).not.toContain(out);
    }
  });

  it('RF-626 a header-only legacy field is drawn "not checked" and is never sent to the planner', async () => {
    const { message, written } = await planned();

    expect(message).not.toContain('Old order number');
    expect(written['ux/wireframes/SCRN-001.html']).toContain(
      'Old order number (text, optional) - not checked',
    );
  });

  it('RF-626 a screen whose fields are all unsupported still has its wireframe, with "fields not confirmed"', async () => {
    const { written } = await planned();

    const html = written['ux/wireframes/SCRN-003.html'] ?? '';
    expect(html).toContain('fields not confirmed');
    expect(html).toContain('Checkout');
  });
});
