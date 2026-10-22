import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { ungatedLoopSetup, textTurn } from '../../../support/agent-loop-harness.js';
import { loanAnswerWithUnreadableCard } from '../../../support/loan-reader-answer.js';

// P3-104, RF-208, EV-07: a repair that returns the same answer ends the repairs; the readable
// cards are kept and only the unreadable one is dropped and noted.

describe('runAgentTask when a repair returns the same answer', () => {
  it('RF-208 sends the repair once, keeps the other cards and notes the dropped one', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn(loanAnswerWithUnreadableCard),
      textTurn(loanAnswerWithUnreadableCard),
      textTurn(loanAnswerWithUnreadableCard),
    ]);

    const result = await runAgentTask(request(fake));

    expect(fake.requests).toHaveLength(2);
    expect(result.drafts.map((draft) => draft.type)).toEqual(['ENT', 'SCRN']);
    expect(result.problems.map((problem) => problem.path)).toEqual(['cards.1.claims']);
  });
});
