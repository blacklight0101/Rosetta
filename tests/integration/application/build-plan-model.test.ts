import { describe, expect, it } from 'vitest';
import { recordingOf } from '../../support/fake-recordings.js';
import { cardsOf, packageOf } from '../../support/plan-method-harness.js';
import { invariant, scenario } from '../../support/task-card-fixtures.js';

// RF-635, RF-639, DEC-176 (Q-C): the card line names the model of the tier the card is rated for and
// the verifier tier of its band, and an M or L card at a risk class is rated 9. Structure tests over
// packages written from a planner answer.

const usage = {
  inputTokens: 10,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
} as const;

const probes = ['A charge of 50, of 49.99 and of 50.01.', 'The same charge written as 5e1.'];
const plain = {
  ...{ title: 'Plain', phase: 1, requirements: [1], acceptanceCriteria: [scenario] },
  ...{ invariant, riskClass: 'none' },
};
const charge = {
  ...plain,
  title: 'Charge',
  riskClass: 'money',
  acceptanceCriteria: [scenario, scenario],
  probes,
};

function plannerAnswering(tasks: readonly object[]): ReturnType<typeof recordingOf> {
  const text = JSON.stringify({
    summary: 'A web shop that replaces the legacy one.',
    requirements: [
      { title: 'Place an order', statement: 'A customer orders.', sources: ['FEAT-001'] },
      { title: 'Free shipping', statement: 'Over 50 ships free.', sources: ['BR-001'] },
    ],
    components: [{ name: 'Order service', responsibility: 'Stores orders.', dependsOn: [] }],
    phases: [{ name: 'Orders', goal: 'Orders move.', exitCriteria: ['Orders run.'] }],
    tasks,
  });
  const reply = (answer: string) => ({
    retried: [],
    response: { text: answer, toolCalls: [], usage, finishReason: 'stop' as const },
  });
  return recordingOf(reply(text), reply('No PRD today.'), reply('No data model today.'));
}

describe('RF-635 RF-639 the model and the verifier on the card line', () => {
  it('RF-635 a medium card at a money risk is rated 9 for the largest tier and named with its model', async () => {
    const buildMethod = { aiAssisted: true, agentTool: { kind: 'claude-code' } } as const;

    const files = await packageOf({ buildMethod }, plannerAnswering([charge, plain]));

    const [money, small] = cardsOf(files);
    expect(money).toContain('\nSize: M (2 points)\n');
    expect(money).toContain('\nDifficulty: 9 (largest tier, model: opus)\n');
    expect(money).toContain('\nVerifier: largest tier, model: opus\n');
    expect(small).toContain('\nDifficulty: 4 (smallest tier, model: haiku)\n');
    expect(small).toContain('\nVerifier: middle tier, model: sonnet\n');
  });

  it('RF-635 a small card at a risk class is built by the middle tier and verified by the largest', async () => {
    const buildMethod = { aiAssisted: true, agentTool: { kind: 'claude-code' } } as const;
    const guarded = { ...plain, title: 'Guard', riskClass: 'security boundary', probes };

    const files = await packageOf({ buildMethod }, plannerAnswering([guarded]));

    const [card] = cardsOf(files);
    expect(card).toContain('\nDifficulty: 4 (middle tier, model: sonnet)\n');
    expect(card).toContain('\nVerifier: largest tier, model: opus\n');
  });

  it('RF-639 a tier with no model name shows the tier alone', async () => {
    const buildMethod = { aiAssisted: true } as const;

    const files = await packageOf({ buildMethod });

    const [, cancel] = cardsOf(files);
    expect(cancel).toContain('\nDifficulty: 4 (middle model tier)\n');
    expect(cancel).toContain('\nVerifier: largest model tier\n');
  });
});
