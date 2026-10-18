import { describe, expect, it } from 'vitest';
import { parseFlowsAnswer } from '../../../../src/application/plan/flows-answer.js';

// RF-625, ADR-013: the planner's flows are untrusted text, read as one JSON object (fenced or in
// prose) with every list and text bounded. Which cards, steps and components are allowed is the
// domain's decision, not this parser's.

const entry = {
  card: 'FLOW-001',
  inScope: true,
  steps: [{ claim: 'FLOW-001.c1', component: 'Web front end', action: 'Sends it.' }],
};

describe('parseFlowsAnswer', () => {
  it('RF-625 reads a fenced JSON object and fills what the answer leaves out', () => {
    const answer =
      '```json\n' + JSON.stringify({ flows: [{ card: 'FLOW-002', inScope: false }] }) + '\n```';

    expect(parseFlowsAnswer(answer)).toEqual({
      flows: [{ card: 'FLOW-002', inScope: false, reason: '', steps: [] }],
    });
  });

  it('RF-625 reads the object inside prose and keeps the steps in order', () => {
    const answer = `Here you go: ${JSON.stringify({ flows: [entry] })} Done.`;

    expect(parseFlowsAnswer(answer)?.flows[0]?.steps).toEqual([
      { claim: 'FLOW-001.c1', component: 'Web front end', action: 'Sends it.' },
    ]);
  });

  it.each([
    ['text that is not JSON', 'No flows today.'],
    ['an object without flows', '{"journeys": []}'],
    ['an empty list of flows', '{"flows": []}'],
    ['a flow without a card', JSON.stringify({ flows: [{ inScope: true }] })],
    ['a flow without inScope', JSON.stringify({ flows: [{ card: 'FLOW-001' }] })],
    [
      'a step without a component',
      JSON.stringify({ flows: [{ ...entry, steps: [{ claim: 'c' }] }] }),
    ],
    ['a card id of 41 characters', JSON.stringify({ flows: [{ ...entry, card: 'F'.repeat(41) }] })],
    [
      'a reason of 2001 characters',
      JSON.stringify({ flows: [{ ...entry, reason: 'r'.repeat(2001) }] }),
    ],
    ['201 flows', JSON.stringify({ flows: Array.from({ length: 201 }, () => entry) })],
  ])('RF-625 refuses %s', (_name, answer) => {
    expect(parseFlowsAnswer(answer)).toBeUndefined();
  });

  it('RF-625 takes the first object of the answer that reads as flows', () => {
    const answer = `{"flows": 3} ${JSON.stringify({ flows: [entry] })}`;

    expect(parseFlowsAnswer(answer)?.flows).toHaveLength(1);
  });
});
