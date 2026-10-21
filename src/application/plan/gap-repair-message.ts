import type { PromptFile } from '../agent/prompt-file.js';
import type { GapProblem } from './gap-answer.js';
import { gapMessage, type GapMessageInput } from './gap-message.js';

// Q-54, RF-627, RF-202, RF-145, ADR-013: the message of the one repair attempt of the gap call. It is
// the message of the call itself (the items still built by no card and the plan, each in a data block
// of its own), followed by the versioned repair prompt and one line for each card that could not be
// read: its position, the field and a fixed reason. A line is written by this program; no word of the
// refused answer reaches the model again.

export interface GapRepair {
  /** The versioned prompt that asks for the cards again (RNF-004). */
  readonly prompt: PromptFile;
  readonly problems: readonly GapProblem[];
}

/** The line that tells the planner what was wrong with one card. */
function problemLine({ position, field, reason }: GapProblem): string {
  return `Card ${String(position)}: the field "${field}" ${reason}.`;
}

/** The user message of the repair: the gap message, the repair prompt, then the problems. */
// Q-54, RF-202
export function gapRepairMessage(
  input: GapMessageInput,
  repair: GapRepair,
  tags: () => string,
): string {
  const lines = repair.problems.map(problemLine).join('\n');
  return `${gapMessage(input, tags)}\n\n${repair.prompt.text.trimEnd()}\n${lines}`;
}
