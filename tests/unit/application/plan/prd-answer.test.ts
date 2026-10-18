import { describe, expect, it } from 'vitest';
import { cardLimits } from '../../../../src/application/cards/card-limits.js';
import { parsePrdAnswer } from '../../../../src/application/plan/prd-answer.js';

// RF-621, ADR-013: the planner's PRD answer is untrusted text read as one bounded JSON object.

const feature = {
  title: 'Order',
  description: 'Place an order.',
  priority: 'Must',
  sources: ['FEAT-001'],
};

describe('parsePrdAnswer', () => {
  it('RF-621 reads a fenced answer and gives every section it left out as empty', () => {
    const draft = parsePrdAnswer(
      `Here.\n\`\`\`json\n${JSON.stringify({ features: [feature] })}\n\`\`\``,
    );

    expect(draft).toEqual({
      problem: undefined,
      goal: undefined,
      roles: [],
      features: [feature],
      rules: [],
      outOfScope: [],
      nonFunctional: [],
    });
  });

  it('RF-621 reads the problem, the goal, the roles, the rules and the lists', () => {
    const statement = { text: 'Replace the shop.', sources: ['FEAT-001'] };
    const draft = parsePrdAnswer(
      JSON.stringify({
        problem: statement,
        goal: statement,
        roles: [{ name: 'Clerk', description: 'Cancels orders.', sources: ['ENT-001'] }],
        rules: [{ text: 'Orders over 50 ship free.', sources: ['BR-001'] }],
        outOfScope: [statement],
        nonFunctional: [statement],
      }),
    );

    expect(draft?.problem).toEqual(statement);
    expect(draft?.roles).toHaveLength(1);
    expect(draft?.rules).toEqual([{ text: 'Orders over 50 ship free.', sources: ['BR-001'] }]);
    expect(draft?.outOfScope).toEqual([statement]);
  });
});

describe('parsePrdAnswer: what it refuses and bounds', () => {
  it('RF-621 an answer with no JSON object is no answer', () => {
    expect(parsePrdAnswer('No PRD today.')).toBeUndefined();
  });

  it('RF-621 a priority outside MoSCoW makes the answer unusable', () => {
    const bad = { ...feature, priority: 'Urgent' };

    expect(parsePrdAnswer(JSON.stringify({ features: [bad] }))).toBeUndefined();
  });

  it('RF-621 reads every priority of MoSCoW', () => {
    const features = ['Must', 'Should', 'Could', 'Wont'].map((priority) => ({
      ...feature,
      priority,
    }));

    expect(parsePrdAnswer(JSON.stringify({ features }))?.features).toHaveLength(4);
  });

  it('RF-621 an over-long statement makes the answer unusable', () => {
    const goal = { text: 'x'.repeat(2001), sources: [] };

    expect(parsePrdAnswer(JSON.stringify({ goal }))).toBeUndefined();
  });

  it('RF-621 only the first part of an over-long answer is read', () => {
    const padding = ' '.repeat(cardLimits.maxOutputChars);

    expect(parsePrdAnswer(`${padding}${JSON.stringify({ features: [feature] })}`)).toBeUndefined();
  });
});
