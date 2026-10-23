import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { planMessage, type PlanMessageInput } from './plan-message.js';
import { packCards, type PlanWindow } from './plan-packing.js';

// P3-113, EV-29: the cards a planner call names by title only, so its prompt fits the window. The
// call is measured with a tag of the length the run draws, as the estimate does.

/** The tag of a data block is 24 characters; the run draws its own. */
export const MEASURING_TAG = 'a'.repeat(24);

export interface PackedCall {
  readonly window?: PlanWindow | undefined;
  readonly prompt: Pick<PromptFile, 'text'>;
}

// P3-113
export function omittedFor(
  call: PackedCall,
  cards: readonly SourceCard[],
  render: (omitted: ReadonlySet<string>) => string,
): ReadonlySet<string> {
  return packCards({ window: call.window, system: call.prompt.text, cards, render }).omitted;
}

/** The input of a call that sends all the supported cards, with the cards that do not fit omitted. */
// P3-113
export function packedInput(call: PackedCall, input: PlanMessageInput): PlanMessageInput {
  const omitted = omittedFor(call, input.cards, (each) =>
    planMessage({ ...input, omitted: each }, () => MEASURING_TAG),
  );
  return { ...input, omitted };
}
