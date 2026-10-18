import { describe, expect, it } from 'vitest';
import { assembleUx } from '../../../../src/domain/planning/target-ux-assembly.js';
import {
  MAX_SCREENS,
  noDesignBrief,
  screenCardsOf,
  type UxDraft,
} from '../../../../src/domain/planning/target-ux.js';
import {
  rejectedScreenCard,
  screenCard,
  shopDraft,
  shopScreens,
} from '../../../support/ux-fixtures.js';

// RF-626, Q-27, DEC-134: the planner's draft made into the target screens. Every verified SCRN
// card ends up kept, merged into another screen or dropped, each with a reason; what a wireframe
// lists comes from the legacy cards, never from the model.

const dropped = (card: string, reason = 'Not needed.') => ({ card, reason });

describe('screenCardsOf', () => {
  it('RF-626 keeps the SCRN cards with a supported claim, in card order, and no other type', () => {
    const cards = [
      rejectedScreenCard('SCRN-009'),
      ...shopScreens(),
      { ...screenCard('FEAT-001', { title: 'Not a screen', route: '/x' }), type: 'FEAT' as const },
    ];

    expect(screenCardsOf(cards).map((card) => card.id)).toEqual([
      'SCRN-001',
      'SCRN-002',
      'SCRN-003',
      'SCRN-004',
      'SCRN-005',
    ]);
  });
});

describe('assembleUx: kept, merged and dropped', () => {
  it('RF-626 a screen of one card is kept, one of several is merged, and each has the planner reason', () => {
    const { ux } = assembleUx(shopDraft(), shopScreens());

    const by = (id: string) => ux.legacy.find((each) => each.cardId === id);
    expect(by('SCRN-003')).toEqual({
      ...{ cardId: 'SCRN-003', title: 'Checkout', route: '/checkout' },
      ...{ disposition: 'kept', reason: 'The main journey.', target: 'SCRN-003' },
    });
    expect(by('SCRN-001')).toMatchObject({
      ...{ disposition: 'merged', target: 'SCRN-001', reason: 'Same data, same people.' },
    });
    expect(by('SCRN-002')).toMatchObject({ disposition: 'merged', target: 'SCRN-001' });
  });

  it('RF-626 a dropped screen keeps its reason and has no target', () => {
    const { ux } = assembleUx(shopDraft(), shopScreens());

    expect(ux.legacy.find((each) => each.cardId === 'SCRN-004')).toMatchObject({
      ...{ disposition: 'dropped', target: null },
      reason: 'The fax page is not part of the new shop.',
    });
  });

  it('RF-626 a screen the planner did not mention is dropped by the code, with a reason that says so', () => {
    const { ux } = assembleUx(shopDraft(), shopScreens());

    const left = ux.legacy.find((each) => each.cardId === 'SCRN-005');
    expect(left).toMatchObject({ disposition: 'dropped', target: null });
    expect(left?.reason).toMatch(/neither kept, merged nor dropped/u);
  });
});

describe('assembleUx: every screen is placed', () => {
  it('RF-626 every verified SCRN card is listed once, in card order, with a non-empty reason', () => {
    const { ux } = assembleUx(shopDraft(), shopScreens());

    expect(ux.legacy.map((each) => each.cardId)).toEqual([
      'SCRN-001',
      'SCRN-002',
      'SCRN-003',
      'SCRN-004',
      'SCRN-005',
    ]);
    expect(ux.legacy.every((each) => each.reason.trim() !== '')).toBe(true);
    expect(ux.screens.map((each) => each.id)).toEqual(['SCRN-001', 'SCRN-003']);
    expect(ux.screens[0]?.cards).toEqual(['SCRN-001', 'SCRN-002']);
  });
});

describe('assembleUx: reasons, unreadable answers and names', () => {
  it('RF-626 a screen with no reason takes a reason from the code', () => {
    const draft: UxDraft = {
      ...shopDraft(),
      screens: [{ name: 'Orders', purpose: '', reason: '  ', cards: ['SCRN-001'] }],
      dropped: [dropped('SCRN-002', '')],
    };

    const { ux } = assembleUx(draft, shopScreens());

    expect(ux.legacy[0]?.reason).toMatch(/gave no reason/u);
    expect(ux.legacy[1]?.reason).toMatch(/gave no reason/u);
  });

  it('RF-626 an unreadable answer drops every screen and keeps no brief', () => {
    const { ux, leftOut } = assembleUx(undefined, shopScreens());

    expect(ux.screens).toEqual([]);
    expect(ux.legacy.map((each) => each.disposition)).toEqual(Array(5).fill('dropped'));
    expect(ux.designBrief).toEqual(noDesignBrief);
    expect(leftOut).toEqual({ screens: 0, cards: 0 });
  });

  it('RF-626 a screen with no name takes the route of its first card', () => {
    const draft: UxDraft = {
      ...shopDraft(),
      screens: [{ name: ' ', purpose: '', reason: 'Kept.', cards: ['SCRN-003'] }],
    };

    expect(assembleUx(draft, shopScreens()).ux.screens[0]?.name).toBe('/checkout');
  });
});

describe('assembleUx: what the checks refuse', () => {
  it('RF-626 a card id no verified SCRN card has is refused and counted', () => {
    const draft: UxDraft = {
      ...shopDraft(),
      screens: [
        ...shopDraft().screens,
        { name: 'Ghost', purpose: '', reason: 'Made up.', cards: ['SCRN-404', 'FEAT-001'] },
      ],
      dropped: [...shopDraft().dropped, dropped('SCRN-405')],
    };

    const { ux, leftOut } = assembleUx(draft, shopScreens());

    expect(ux.screens.map((each) => each.name)).toEqual(['Orders', 'Checkout']);
    expect(ux.legacy.map((each) => each.cardId)).not.toContain('SCRN-404');
    expect(leftOut).toEqual({ screens: 1, cards: 3 });
  });

  it('RF-626 a card placed twice stays with the first entry and the repeat is counted', () => {
    const draft: UxDraft = {
      ...shopDraft(),
      screens: [
        ...shopDraft().screens,
        { name: 'Again', purpose: '', reason: 'Twice.', cards: ['SCRN-003', 'SCRN-005'] },
      ],
      dropped: [...shopDraft().dropped, dropped('SCRN-001')],
    };

    const { ux, leftOut } = assembleUx(draft, shopScreens());

    expect(ux.legacy.find((each) => each.cardId === 'SCRN-003')?.target).toBe('SCRN-003');
    expect(ux.legacy.find((each) => each.cardId === 'SCRN-001')?.disposition).toBe('merged');
    expect(ux.screens.find((each) => each.name === 'Again')?.cards).toEqual(['SCRN-005']);
    expect(leftOut).toEqual({ screens: 0, cards: 2 });
  });
});

describe('assembleUx: the cap and the brief', () => {
  it('RF-626 Q-27 at most 20 screens get a wireframe; the others are dropped with the cap as the reason', () => {
    const cards = Array.from({ length: MAX_SCREENS + 2 }, (_, index) =>
      screenCard(`SCRN-${String(index + 1).padStart(3, '0')}`, {
        title: `Screen ${String(index + 1)}`,
        route: `/s${String(index + 1)}`,
      }),
    );
    const draft: UxDraft = {
      ...shopDraft(),
      dropped: [],
      screens: cards.map((card) => ({
        ...{ name: card.title, purpose: '', reason: 'Main.' },
        cards: [card.id],
      })),
    };

    const { ux } = assembleUx(draft, cards);

    expect(ux.screens).toHaveLength(MAX_SCREENS);
    const over = ux.legacy.filter((each) => each.disposition === 'dropped');
    expect(over.map((each) => each.cardId)).toEqual(['SCRN-021', 'SCRN-022']);
    expect(over[0]?.reason).toMatch(/over the cap \(Q-27\)/u);
  });

  it('RF-626 the brief is the planner brief with blank components left out', () => {
    const draft: UxDraft = {
      ...shopDraft(),
      designBrief: { audience: 'A', tone: '', components: ['Table', '  ', 'Dialog'] },
    };

    expect(assembleUx(draft, shopScreens()).ux.designBrief).toEqual({
      audience: 'A',
      tone: '',
      components: ['Table', 'Dialog'],
    });
  });

  it('RF-626 the brief lists at most 20 components', () => {
    const many = Array.from({ length: 30 }, (_, index) => `Component ${String(index)}`);
    const draft: UxDraft = {
      ...shopDraft(),
      designBrief: { audience: '', tone: '', components: many },
    };

    const { components } = assembleUx(draft, shopScreens()).ux.designBrief;

    expect(components).toEqual(many.slice(0, 20));
  });
});

describe('assembleUx: what a wireframe lists', () => {
  it('RF-626 the fields, actions and roles of a merged screen are the union of its legacy cards, each once', () => {
    const orders = assembleUx(shopDraft(), shopScreens()).ux.screens[0];

    expect(orders?.fields).toEqual([
      { name: 'Search', inputKind: 'text', required: true },
      { name: 'Status', inputKind: 'dropdown', required: false },
      { name: 'Order number', inputKind: 'text', required: true },
    ]);
    expect(orders?.actions).toEqual([
      { label: 'Open order', handler: 'openOrder', flow: null },
      { label: 'Place order', handler: null, flow: 'FLOW-001' },
    ]);
    expect(orders?.roles).toEqual(['Shopper', 'Staff']);
  });

  it('RF-626 navigation leads to the target screen that replaced the legacy screen, never to itself', () => {
    const { ux } = assembleUx(shopDraft(), shopScreens());

    expect(ux.screens[0]?.navigation).toEqual([{ label: 'Checkout', screenId: 'SCRN-003' }]);
    expect(ux.screens[1]?.navigation).toEqual([{ label: 'Orders', screenId: 'SCRN-001' }]);
  });
});

describe('assembleUx: navigation and what the draft cannot add', () => {
  it('RF-626 navigation to a dropped screen or to a route nobody has is text with no link', () => {
    const cards = [
      screenCard('SCRN-001', {
        ...{ title: 'Start', route: '/start' },
        leadsTo: ['SCRN-004', '/fax', '/ghost'],
      }),
      screenCard('SCRN-004', { title: 'Fax', route: '/fax' }),
    ];
    const draft: UxDraft = {
      ...shopDraft(),
      screens: [{ name: 'Start', purpose: '', reason: 'Kept.', cards: ['SCRN-001'] }],
      dropped: [dropped('SCRN-004')],
    };

    const navigation = assembleUx(draft, cards).ux.screens[0]?.navigation;

    expect(navigation).toEqual([
      { label: 'SCRN-004 (dropped legacy screen)', screenId: null },
      { label: '/fax (dropped legacy screen)', screenId: null },
      { label: '/ghost', screenId: null },
    ]);
  });

  it('RF-626 the draft cannot add a field, an action or a link to a wireframe', () => {
    const sneaky = {
      ...{ name: 'Checkout', purpose: '', reason: 'Kept.', cards: ['SCRN-003'] },
      fields: [{ name: 'Injected' }],
      navigation: [{ label: 'Elsewhere', screenId: 'SCRN-009' }],
    };
    const draft: UxDraft = { ...shopDraft(), screens: [sneaky] };

    const screen = assembleUx(draft, shopScreens()).ux.screens[0];

    expect(JSON.stringify(screen)).not.toMatch(/Injected|Elsewhere/u);
  });
});
