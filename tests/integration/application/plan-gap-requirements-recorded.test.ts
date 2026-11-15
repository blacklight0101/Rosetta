import { describe, expect, it } from 'vitest';
import { planLinks } from '../../../src/application/plan/plan-links.js';
import { ev95Calls, ev95Input } from '../../support/eshop-gap-round-fixtures.js';

// P9-06, RF-627, EV-108, ADR-008: the eShop plan completed first try with requirements built by
// no task card (REQ-020 and REQ-024 of that plan). Here requirement 22 of the recorded eShop plan,
// "Missing item on update keeps legacy behaviour", is listed by no card, and four flows are open after the first
// gap round (EV-95). A requirement no card lists is an item of the gap round like a flow: the second
// round asks for it, and one still open after it is reported as an item is.
// tests/recordings/fake/planner-gap-eshop-ev108-requirement.json writes a card that builds it,
// tests/recordings/fake/planner-gap-eshop-ev108-requirement-open.json writes none.

const built = 'planner-gap-eshop-ev108-requirement.json';
const open = 'planner-gap-eshop-ev108-requirement-open.json';
const flows = ['flow:FLOW-002', 'flow:FLOW-009', 'flow:FLOW-010', 'flow:FLOW-012'];

async function linksOf(recording: string) {
  const { calls, provider } = await ev95Calls(recording);
  const result = await planLinks(calls, await ev95Input([22]));
  return { result, provider };
}

const idsIn = (text: string): string[] =>
  [...text.matchAll(/"id": "([a-z]+:[^"]+)"/gu)].map((match) => match[1] ?? '');

const blockOf = (request: { readonly messages: readonly { readonly content: string }[] }) =>
  idsIn(
    request.messages
      .map((each) => each.content)
      .join('\n')
      .split('<<<END')[0] ?? '',
  );

describe('a requirement built by no card in the recorded eShop plan (EV-108)', () => {
  it('RF-627 P9-06 the plan starts with the requirement as an item built by no card', async () => {
    const { result } = await linksOf(open);

    expect(result.planned.report.items.map((each) => each.id)).toContain('requirement:REQ-022');
    expect(result.planned.content.requirements[21]?.title).toBe(
      'Missing item on update keeps legacy behaviour',
    );
  });

  it('RF-627 P9-06 the second gap round asks for the four flows and the requirement', async () => {
    const { provider } = await linksOf(built);

    expect(provider.requests).toHaveLength(3);
    const [, , round] = provider.requests;
    expect(blockOf(round ?? { messages: [] })).toEqual([...flows, 'requirement:REQ-022']);
  });

  it('RF-627 P9-06 a card that builds the requirement completes the plan', async () => {
    const { result } = await linksOf(built);

    expect(result.planned.report.uncovered).toEqual([]);
    expect(result.gapRounds).toBe(2);
    const card = result.planned.content.tasks.find(
      (task) => task.title === 'Keep the legacy answer for an update of a missing item',
    );
    expect(card?.requirements).toContain('REQ-022');
    expect(card?.builds.some((id) => id.startsWith('requirement:'))).toBe(false);
    expect(result.refusal).toBeUndefined();
  });

  it('RF-627 P9-06 RST-1806 a requirement still built by no card after the last round is reported', async () => {
    const { result, provider } = await linksOf(open);

    expect(provider.requests).toHaveLength(3);
    expect(result.gapRounds).toBe(2);
    expect(result.planned.report.uncovered.map((each) => each.id)).toEqual(['requirement:REQ-022']);
    expect(result.warnings.join('\n')).toMatch(
      /1 item\(s\) of the package are built by no task card/u,
    );
  });
});
