import { assemblePrd, emptyPrd, type PrdContent } from '../../domain/planning/prd-content.js';
import { askPlanner, type PlannerCall } from './ask-planner.js';
import type { PlanMessageInput } from './plan-message.js';
import { parsePrdAnswer } from './prd-answer.js';

// RF-621: the PRD from the planner's second call. An answer that cannot be read leaves every section
// a placeholder with its open question, and statements without a supported card of the right type are
// left out; both are logged through `warn`. The call itself failing fails the run.

// RF-621
export async function planPrd(
  call: PlannerCall,
  input: PlanMessageInput,
  warn: (message: string) => Promise<void>,
): Promise<PrdContent> {
  const draft = parsePrdAnswer(await askPlanner(call, input));
  if (draft === undefined) {
    await warn('The planner answer for the PRD could not be read; every section is a placeholder.');
    return emptyPrd;
  }
  const { content, dropped } = assemblePrd(draft, new Map(input.cards.map((c) => [c.id, c.type])));
  if (dropped > 0) {
    await warn(
      `The PRD answer had ${String(dropped)} statement(s) without a supported card; they were left out.`,
    );
  }
  return content;
}
