import { describe, expect, it } from 'vitest';
import { planLinks } from '../../../src/application/plan/plan-links.js';
import { ev95Calls, ev95Flows, ev95Input } from '../../support/eshop-gap-round-fixtures.js';

// P8-95, RF-627, EV-95, ADR-008: the first eShop plan try of the evaluation of 2026-11-02 ended
// RST-1806 with FLOW-002, FLOW-009, FLOW-010 and FLOW-012 built by no card. Its recorded answers
// show why: the coverage call linked the plan's card "Create, edit and delete catalog items for
// signed-in users" (T-004) to the admin create journey but not to those four, which are the same
// create, edit and delete journeys of the other legacy front ends; the gap call (gap.v4) said not
// to repeat the work of a card that exists and gave no way to say which card already does it, so
// its answer wrote 20 cards for the 29 other items of the block, none for the four, and left no
// card out, so no repair was asked. From gap.v5 on (gap.v6 now) the answer links the four to T-004
// (tests/recordings/fake/planner-gap-eshop-ev95-links.json, the recorded answer plus that link)
// and they are built. P8-96: the four flows the gap.v4 answer leaves open now get a second gap
// round, so the recorded answer is replayed with a synthetic second answer that writes nothing
// (planner-gap-eshop-ev95-still-open.json).

const recorded = 'planner-gap-eshop-ev95-still-open.json';
const linked = 'planner-gap-eshop-ev95-links.json';

async function linksOf(recording: string) {
  const { calls, provider } = await ev95Calls(recording);
  const result = await planLinks(calls, await ev95Input());
  return { result, provider };
}

const idsIn = (text: string): string[] =>
  [...text.matchAll(/"id": "([a-z]+:[^"]+)"/gu)].map((match) => match[1] ?? '');

describe('the recorded first gap round of the eShop plan (EV-95)', () => {
  it('RF-627 P8-95 asks for the 33 items the coverage call left, the four flows among them', async () => {
    const { provider } = await linksOf(recorded);

    expect(provider.requests).toHaveLength(3);
    const message = provider.requests[1]?.messages.map((each) => each.content).join('\n') ?? '';
    const items = idsIn(message.split('<<<END')[0] ?? '');
    expect(items).toHaveLength(33);
    expect(items).toEqual(expect.arrayContaining(ev95Flows));
    expect(message).toContain(
      '"title": "Create, edit and delete catalog items for signed-in users"',
    );
  });

  it('RF-627 P8-95 the gap.v4 answer writes no card for the four flows and leaves no card out', async () => {
    const { result, provider } = await linksOf(recorded);

    const open = result.planned.report.uncovered.map((each) => each.id);
    expect(open).toEqual(ev95Flows);
    expect(result.planned.report.modules).toEqual([]);
    expect(result.leftOut).toEqual([]);
    expect(provider.requests).toHaveLength(3);
    const named = result.planned.content.tasks.flatMap((task) => task.builds);
    for (const id of ev95Flows) expect(named).not.toContain(id);
  });

  it('RF-627 P8-95 the answer that links the four flows to T-004 builds them, with no other call', async () => {
    const { result, provider } = await linksOf(linked);

    expect(result.planned.report.uncovered).toEqual([]);
    expect(provider.requests).toHaveLength(2);
    const card = result.planned.content.tasks.find((task) => task.id === 'T-004');
    expect(card?.title).toBe('Create, edit and delete catalog items for signed-in users');
    expect(card?.builds).toEqual(expect.arrayContaining(ev95Flows));
    expect(result.planned.content.tasks).toHaveLength(25);
    expect(result.warnings).toContain(
      'The gap answer linked flow:FLOW-002, flow:FLOW-009, flow:FLOW-010, flow:FLOW-012 to T-004, a task card of the plan.',
    );
    expect(result.warnings.join('\n')).not.toMatch(/built by no task card/u);
  });
});
