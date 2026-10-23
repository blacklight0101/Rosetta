import type { PlanDraft, UnreadableItem } from '../../domain/planning/plan-draft.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { packedInput } from './plan-call-packing.js';
import { readPlanAnswer } from './plan-answer.js';
import type { PlanProblem, PlanReading } from './plan-reading.js';
import { planMessage, type PlanMessageInput } from './plan-message.js';

// P3-126, RF-601, RF-202, ADR-013: the one repair attempt of the plan answer. When no requirement of
// the first answer could be read, the planner gets the same message again, then the versioned repair
// prompt and one line for each failing path: the list, the position and the field. A line is written
// by this program; no word of the refused answer reaches the model again. The call goes through the
// same guarded provider as the first one, so a refusal by a guard rejects like any planner call.

/** The place of an item in the answer, for example `technical.security, position 2`. */
export function placeOf({ list, position }: Pick<PlanProblem, 'list' | 'position'>): string {
  return position === undefined ? list : `${list}, position ${String(position)}`;
}

const problemLine = (problem: PlanProblem): string =>
  `${placeOf(problem)}: the field "${problem.field}".`;

/** The user message of the repair: the plan message, the repair prompt, then the problems. */
// RF-202
function planRepairMessage(
  message: string,
  prompt: PromptFile,
  problems: readonly PlanProblem[],
): string {
  return `${message}\n\n${prompt.text.trimEnd()}\n${problems.map(problemLine).join('\n')}`;
}

/** The second reading of the answer, after one more call that names the failing paths. */
// P3-126
async function repairPlan(
  call: PlannerCall,
  input: PlanMessageInput,
  repair: { readonly prompt: PromptFile; readonly problems: readonly PlanProblem[] },
): Promise<PlanReading> {
  const first = planMessage(packedInput(call, input), call.tags);
  const message = planRepairMessage(first, repair.prompt, repair.problems);
  return readPlanAnswer(await askPlannerWith(call, message));
}

/**
 * The draft of the planner's answer: the first reading, or when no requirement of it read, the one
 * after the repair call. Undefined when the repair did not fix it either.
 */
// P3-126
export async function draftAfterRepair(
  call: PlannerCall,
  input: PlanMessageInput,
  prompt: PromptFile,
  first: PlanReading,
): Promise<PlanDraft | undefined> {
  if (first.draft !== undefined) return first.draft;
  return (await repairPlan(call, input, { prompt, problems: first.problems })).draft;
}

/** What to log about the items the answer left out: the place and field, never a word of the answer. */
export function unreadableMessages(items: readonly UnreadableItem[]): string[] {
  return items.map(
    (item) =>
      `Item ${placeOf(item)} of the plan answer was left out (the field "${item.field}"). ${item.reason}`,
  );
}
