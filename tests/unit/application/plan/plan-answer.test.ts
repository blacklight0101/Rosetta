import { describe, expect, it } from 'vitest';
import { cardLimits } from '../../../../src/application/cards/card-limits.js';
import { parsePlanAnswer } from '../../../../src/application/plan/plan-answer.js';

// RF-601, ADR-013: the planner's answer is untrusted text read as one bounded JSON object.

const requirement = { title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] };

describe('parsePlanAnswer', () => {
  it('RF-601 reads a fenced answer and gives every list it left out as empty', () => {
    const draft = parsePlanAnswer(
      `Here is the plan.\n\`\`\`json\n${JSON.stringify({ requirements: [requirement] })}\n\`\`\``,
    );

    expect(draft).toEqual({
      summary: '',
      requirements: [requirement],
      components: [],
      decisions: [],
      entities: [],
      phases: [],
      tasks: [],
      risks: [],
    });
  });

  it('RF-601 an answer without a requirement is no answer', () => {
    expect(parsePlanAnswer('{"requirements": []}')).toBeUndefined();
    expect(parsePlanAnswer('No plan today.')).toBeUndefined();
  });

  it('RF-601 a task card without acceptance criteria makes the answer unusable', () => {
    const task = { title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: [] };

    expect(parsePlanAnswer(JSON.stringify({ requirements: [requirement], tasks: [task] }))).toBe(
      undefined,
    );
  });

  it('RF-601 a phase without exit criteria makes the answer unusable', () => {
    const phase = { name: 'First', goal: 'Orders.', exitCriteria: [] };

    expect(
      parsePlanAnswer(JSON.stringify({ requirements: [requirement], phases: [phase] })),
    ).toBeUndefined();
  });

  it('RF-601 refuses a text longer than its bound', () => {
    const long = { ...requirement, statement: 'x'.repeat(2001) };

    expect(parsePlanAnswer(JSON.stringify({ requirements: [long] }))).toBeUndefined();
  });
});

describe('parsePlanAnswer: the output cap', () => {
  it('RF-601 reads no JSON past the output cap', () => {
    const padding = ' '.repeat(cardLimits.maxOutputChars);

    expect(parsePlanAnswer(`${padding}${JSON.stringify({ requirements: [requirement] })}`)).toBe(
      undefined,
    );
  });
});
