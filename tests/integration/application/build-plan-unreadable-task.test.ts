import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import type { Recording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { useTempRoot } from '../../support/temp-root.js';
import { scenario } from '../../support/task-card-fixtures.js';

// P3-82, EV-01: a task card of the planner's answer that cannot be read is listed with its own
// reason, once, and the run goes on with the others. The planner's first answer is replaced here.

const temp = useTempRoot('rosetta-plan-unreadable-task-');

/** The planner's first answer replaced by `text`; the other recorded answers stay as they are. */
function withFirstAnswer(recording: Recording, text: string): Recording {
  const attempt = recording.calls[0]?.attempts[0];
  if (attempt === undefined || !('response' in attempt)) throw new Error('No answer recorded');
  const [, ...rest] = recording.calls;
  return {
    ...recording,
    calls: [{ attempts: [{ response: { ...attempt.response, text } }] }, ...rest],
  };
}

const answer = JSON.stringify({
  requirements: [{ title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] }],
  phases: [{ name: 'First', goal: 'Orders.', exitCriteria: ['Orders work.'] }],
  tasks: [
    {
      title: 'Orders',
      phase: 1,
      requirements: [1],
      invariant: 'Orders are placed once.',
      riskClass: 'none',
      acceptanceCriteria: [scenario],
    },
    { title: 'Broken', phase: 1, requirements: [1], acceptanceCriteria: [] },
    // Not a phase of the plan: the domain leaves it out, and checks.md lists it too.
    {
      title: 'Late',
      phase: 9,
      requirements: [1],
      invariant: 'x',
      riskClass: 'none',
      acceptanceCriteria: [scenario],
    },
  ],
});

describe('BuildPlan: a task card that cannot be read', () => {
  it('P3-82 is listed once with its position and field, and the other cards stay', async () => {
    const recording = withFirstAnswer(
      await loadRecording(join('tests', 'recordings', 'fake', 'planner-package.json')),
      answer,
    );
    const h = await createPlanHarness(join(temp.path, 'local'), recording, { cloudPlanner: false });
    const understood = await h.understandRun({ cards: planCards(), questions: planQuestions });
    await h.answer(understood, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel.' }]);
    await h.saveBrief({ migration: 'parallel-change' });

    const run = await h.plan();

    const left = h.s.logger.entries.filter((entry) =>
      entry.message.includes('of the plan answer was left out'),
    );
    expect(left).toHaveLength(2);
    expect(left[0]?.message).toContain('Task card at position 2');
    expect(left[0]?.message).toContain('the field "acceptanceCriteria"');
    const checks = (await h.handoffOf(run))['checks.md'] ?? '';
    expect(checks).toContain('## Left out');
    expect(checks).toContain('### Task cards');
    expect(checks).toContain('- `2`: the field "acceptanceCriteria". The card is not readable');
    expect(checks).toContain('- `3`: the field "phase". The phase is not a phase of the plan.');
    expect(checks.split('- `2`: the field').length).toBe(2);
    const messages = h.s.logger.entries.map((entry) => entry.message);
    expect(messages.some((message) => message.includes('named no requirement'))).toBe(false);
  });

  it('P3-82 an answer that cannot be read at all fails with its own reason, RST-1803', async () => {
    const recording = withFirstAnswer(
      await loadRecording(join('tests', 'recordings', 'fake', 'planner-package.json')),
      'No plan today.',
    );
    const h = await createPlanHarness(join(temp.path, 'prose'), recording, { cloudPlanner: false });
    const understood = await h.understandRun({ cards: planCards(), questions: planQuestions });
    await h.answer(understood, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel.' }]);
    await h.saveBrief({ migration: 'parallel-change' });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    const refused = h.s.logger.entries.filter((entry) => entry.code === 'RST-1803');
    expect(refused.map((entry) => entry.message)).toEqual([
      expect.stringContaining('could not be read'),
    ]);
  });
});
