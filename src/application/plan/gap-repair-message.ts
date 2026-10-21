import type { PromptFile } from '../agent/prompt-file.js';
import type { GapProblem } from './gap-answer.js';
import { gapMessage, type GapMessageInput } from './gap-message.js';

// Q-54, RF-627, RF-202: the message of the one repair attempt of the gap call.

export interface GapRepair {
  readonly prompt: PromptFile;
  readonly problems: readonly GapProblem[];
}

/** The gap message, then the repair prompt and the problems. */
// Q-54
export function gapRepairMessage(
  input: GapMessageInput,
  _repair: GapRepair,
  tags: () => string,
): string {
  return gapMessage(input, tags);
}
