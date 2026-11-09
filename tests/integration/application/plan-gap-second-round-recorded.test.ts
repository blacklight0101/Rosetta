import { describe, expect, it } from 'vitest';
import { planLinks } from '../../../src/application/plan/plan-links.js';
import { ev95Calls, ev95Flows, ev95Input } from '../../support/eshop-gap-round-fixtures.js';

// P8-96, RF-627, EV-95, ADR-008: the first eShop plan try of the evaluation of 2026-11-02 ended
// RST-1806 after one gap round left FLOW-002, FLOW-009, FLOW-010 and FLOW-012 built by no card, and
// completed on the retry from the same inputs. Items still open after a first round whose answers
// could all be read now get one second gap round that lists only them. The recordings replay the
// recorded coverage and gap.v4 answers of that try, then a synthetic answer to the second round:
// tests/recordings/fake/planner-gap-eshop-ev95-second-round.json links the four flows to T-004,
// tests/recordings/fake/planner-gap-eshop-ev95-still-open.json writes nothing.

const second = 'planner-gap-eshop-ev95-second-round.json';
const stillOpen = 'planner-gap-eshop-ev95-still-open.json';
const linked = 'planner-gap-eshop-ev95-links.json';

async function linksOf(recording: string) {
  const { calls, provider } = await ev95Calls(recording);
  const result = await planLinks(calls, await ev95Input());
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

describe('the second gap round of the recorded eShop plan (EV-95)', () => {
  it('RF-627 P8-96 asks a second round for only the four flows the first round left', async () => {
    const { provider } = await linksOf(second);

    expect(provider.requests).toHaveLength(3);
    const [, , round] = provider.requests;
    expect(round?.context.agentTaskId).toBe('planner-gap');
    expect(blockOf(round ?? { messages: [] })).toEqual(ev95Flows);
  });

  it('RF-627 P8-96 the second answer that links the four flows to T-004 completes the plan', async () => {
    const { result } = await linksOf(second);

    expect(result.planned.report.uncovered).toEqual([]);
    expect(result.gapRounds).toBe(2);
    const card = result.planned.content.tasks.find((task) => task.id === 'T-004');
    expect(card?.title).toBe('Create, edit and delete catalog items for signed-in users');
    expect(card?.builds).toEqual(expect.arrayContaining(ev95Flows));
    expect(result.refusal).toBeUndefined();
    expect(result.warnings).toContain(
      'The second gap answer linked flow:FLOW-002, flow:FLOW-009, flow:FLOW-010, flow:FLOW-012 to T-004, a task card of the plan.',
    );
    expect(result.warnings).toContain(
      '4 item(s) were still built by no task card after the gap round, so the planner was asked once more for them.',
    );
    expect(result.warnings.join('\n')).not.toMatch(/built by no task card:/u);
  });

  it('RF-627 P8-96 RST-1806 the four flows still open after the second round are reported as today', async () => {
    const { result, provider } = await linksOf(stillOpen);

    expect(provider.requests).toHaveLength(3);
    expect(result.gapRounds).toBe(2);
    expect(result.refusal).toBeUndefined();
    expect(result.planned.report.uncovered.map((each) => each.id)).toEqual(ev95Flows);
    expect(result.leftOut).toEqual([]);
  });

  it('RF-627 P8-96 a first round that builds every item asks for no second round', async () => {
    const { result, provider } = await linksOf(linked);

    expect(provider.requests).toHaveLength(2);
    expect(result.gapRounds).toBe(1);
    expect(result.planned.report.uncovered).toEqual([]);
  });
});
