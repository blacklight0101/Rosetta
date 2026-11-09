import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runJourney, type Journey } from '../../support/journey-harness.js';
import { cardTitles, citedIds, recordedAnswer } from '../../support/shop-recordings.js';
import { useSharedValue } from '../../support/understand-full-run.js';

// RF-210, DEC-216, ADR-008, P8-115: the shop recordings cite cards by id, and the ids follow the order
// the readers run in (P8-94). The recordings stay fake; these tests replay the journey and say which
// card each citation names, so a recording that cites an id the run did not write, or one that now
// names another card, fails here and not as a plan about the wrong feature.

const journey = useSharedValue('rosetta-shop-cards-', (dir) => runJourney(dir));
const current = (): Journey => journey.current();

const READER = 'understand-shop-journey.json';
const PLANNER = 'planner-shop.json';
const COVERAGE = 'planner-shop-coverage.json';

const ids = z.array(z.string());
const named = z.object({ title: z.string(), sources: ids });
const sentence = z.object({ text: z.string(), cards: ids });
const screenGroups = z.object({ screens: z.array(z.object({ name: z.string(), cards: ids })) });

/** The titles of the cards the ids name, a missing card shown by its id. */
function titlesOf(list: readonly string[]): string[] {
  const titles = cardTitles(current().specification);
  return list.map((id) => titles.get(id) ?? `no card ${id}`);
}

const sorted = (list: readonly string[]): string[] => list.toSorted();

describe('the shop recordings: the cards they cite exist', () => {
  it('RF-210 every card and claim a shop recording cites is one the replay wrote', async () => {
    const cited = await citedIds({ [READER]: 10, [PLANNER]: 6, [COVERAGE]: 1 });
    const { specification } = current();

    const titles = cardTitles(specification);
    const missing = cited.filter((id) => {
      const [card = '', claim] = id.split('.');
      const text = specification[`cards/${card.split('-')[0] ?? ''}/${card}.md`] ?? '';
      return !titles.has(card) || (claim !== undefined && !text.includes(`### ${id} (`));
    });
    expect(cited.length).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });
});

describe('the shop recordings: the verifier rejects the claims it means to', () => {
  it('RF-210 the verifier recording rejects exactly the three claims it names, with their cards', () => {
    // The verifier's rejections sit at call positions, so a new reader order moves them silently.
    const rejected = Object.entries(current().specification)
      .filter(([path]) => path.startsWith('cards/'))
      .flatMap(([, text]) => [...text.matchAll(/^### (\S+) \(Rejected\)/gmu)])
      .map((match) => match[1] ?? '')
      .toSorted();

    expect(rejected).toEqual(['FLOW-003.c2', 'SCRN-001.c7', 'SCRN-004.c1']);
    expect(titlesOf(rejected.map((id) => id.split('.')[0] ?? ''))).toEqual([
      'Browse the catalogue',
      'Checkout',
      'Catalogue list',
    ]);
  });
});

describe('the shop recordings: the plan and the PRD name their cards', () => {
  it('RF-210 the plan and the PRD cite the feature and the flow of each requirement', async () => {
    const plan = await recordedAnswer(PLANNER, 0, z.object({ requirements: z.array(named) }));
    const prd = await recordedAnswer(
      PLANNER,
      1,
      z.object({ goal: z.object({ sources: ids }), features: z.array(named) }),
    );

    const requirements = plan.requirements.map((r) => [r.title, sorted(titlesOf(r.sources))]);
    expect(Object.fromEntries(requirements)).toEqual({
      'Search the catalogue': ['Browse the catalogue', 'Search the catalogue'],
      'Keep a basket': ['Add an item to the basket', 'Keep a basket'],
      'Place an order': ['Place an order', 'Place an order'],
      'Shipping fee': ['Express shipping costs 12'],
    });
    const features = prd.features.map((f) => [f.title, titlesOf(f.sources)]);
    expect(Object.fromEntries(features)).toEqual({
      'Search the catalogue': ['Search the catalogue'],
      'Keep a basket': ['Keep a basket'],
      'Place an order': ['Place an order'],
    });
    expect(titlesOf(prd.goal.sources)).toEqual(['Place an order']);
  });
});

describe('the shop recordings: the flows, operations and screens name their cards', () => {
  it('RF-210 the flows, the API operations and the screens name the cards of their journeys', async () => {
    const flows = await recordedAnswer(
      PLANNER,
      3,
      z.object({ flows: z.array(z.object({ card: z.string() })) }),
    );
    const operations = z.array(z.object({ operationId: z.string(), serves: ids }));
    const api = await recordedAnswer(PLANNER, 4, z.object({ operations }));
    const ux = await recordedAnswer(PLANNER, 5, screenGroups);

    expect(titlesOf(flows.flows.map((f) => f.card))).toEqual([
      'Browse the catalogue',
      'Add an item to the basket',
      'Place an order',
    ]);
    const served = api.operations.map((o) => [o.operationId, sorted(titlesOf(o.serves))]);
    expect(Object.fromEntries(served)).toEqual({
      searchCatalogue: ['Browse the catalogue', 'Search the catalogue'],
      getCatalogueItem: ['Add an item to the basket'],
      addToBasket: ['Add an item to the basket', 'Keep a basket'],
      placeOrder: ['Place an order', 'Place an order'],
    });
    const screens = ux.screens.map((s) => [s.name, sorted(titlesOf(s.cards))]);
    expect(Object.fromEntries(screens)).toEqual({
      Catalogue: ['Catalogue list', 'Item details'],
      Checkout: ['Checkout'],
      'Order confirmation': ['Order confirmation'],
    });
  });
});

describe('the shop recordings: the coverage links name their cards', () => {
  it('RF-627 the coverage links give each task card the flows and screens of its own features', async () => {
    const ux = await recordedAnswer(PLANNER, 5, screenGroups);
    const linked = z.object({ links: z.array(z.object({ task: z.number(), builds: ids })) });
    const { links } = await recordedAnswer(COVERAGE, 0, linked);

    // A screen is built by the id of its first card: the domain sorts the cards of a screen.
    const screenOf = new Map(ux.screens.map((s) => [s.cards.toSorted()[0] ?? '', s.name]));
    const built = (task: number, kind: string): string[] =>
      links
        .filter((link) => link.task === task)
        .flatMap((link) => link.builds)
        .filter((item) => item.startsWith(`${kind}:`))
        .map((item) => item.slice(kind.length + 1));
    const screens = (task: number): string[] =>
      built(task, 'screen').map((id) => screenOf.get(id) ?? `no screen ${id}`);

    expect(sorted(titlesOf(built(1, 'flow')))).toEqual([
      'Add an item to the basket',
      'Browse the catalogue',
    ]);
    expect(screens(1)).toEqual(['Catalogue']);
    expect(titlesOf(built(2, 'flow'))).toEqual(['Place an order']);
    expect(sorted(screens(2))).toEqual(['Checkout', 'Order confirmation']);
  });
});

describe('the shop recordings: the overview names its cards', () => {
  it('RF-264 the overview cites the cards of the sentence it writes', async () => {
    const overview = await recordedAnswer(
      READER,
      9,
      z.object({
        application: z.array(sentence),
        users: z.array(sentence),
        features: z.array(sentence),
        screens: z.array(sentence),
      }),
    );

    const lines = [
      ...overview.application,
      ...overview.users,
      ...overview.features,
      ...overview.screens,
    ];
    const cited = lines.map((each) => [each.text, sorted(titlesOf(each.cards))]);
    expect(Object.fromEntries(cited)).toEqual({
      'A small shop: visitors browse a catalogue, fill a basket and place an order.': [
        'Catalog item',
        'Place an order',
        'Search the catalogue',
      ],
      'Visitors browse, add to the basket and check out.': ['Place an order'],
      'Visitors search the catalogue and open one item.': [
        'Browse the catalogue',
        'Search the catalogue',
      ],
      'Visitors keep a basket and place an order with a shipping choice.': [
        'Keep a basket',
        'Place an order',
        'Place an order',
      ],
      'Express shipping costs 12 and any other choice costs 4.': ['Express shipping costs 12'],
      'Four pages: the catalogue list, the item details, the checkout and the order confirmation.':
        ['Catalogue list', 'Checkout', 'Item details', 'Order confirmation'],
    });
  });
});
