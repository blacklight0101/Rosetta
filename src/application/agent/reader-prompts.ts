import type { PromptVersion } from '../../domain/runs/run-manifest.js';
import type { PromptFile } from './prompt-file.js';

// RF-145, RF-201, RF-202, RNF-004: the prompt files of a reader agent task. The system prompt is
// the reader prompt and the card format, and holds no repository text; the area reaches the model
// in the first user message, inside a data block, and the turns left after each tool turn.

export interface ReaderPrompts {
  /** `reader/area.v<n>.md`: the reader's role, the data-block rule and the tools. */
  readonly system: PromptFile;
  /** `cards/card-format.v<n>.md`: the shape of the final answer. */
  readonly cardFormat: PromptFile;
  /** `reader/task.v<n>.md`: the first user message, with the area's data block. */
  readonly task: PromptFile;
  /** `reader/turns-left.v<n>.md`: the user message after each tool turn. */
  readonly turnsLeft: PromptFile;
  /** `cards/repair.v<n>.md`: the repair request, sent up to twice with the problems left (RF-208). */
  readonly repair: PromptFile;
  /** `cards/continue.v<n>.md`: asks an answer cut off by the output limit to go on (RF-208). */
  readonly continue: PromptFile;
}

/** The one placeholder each template prompt must hold. */
export const readerPlaceholders = {
  task: '{{area}}',
  turnsLeft: '{{turns}}',
  repair: '{{problems}}',
} as const;

/** The same on every turn, so providers that cache a stable prefix charge less for it. */
export function readerSystemPrompt(prompts: ReaderPrompts): string {
  return `${prompts.system.text}\n\n${prompts.cardFormat.text}`;
}

/** The first user message: the task text with the area's data block in place of its placeholder. */
export function readerTaskMessage(prompts: ReaderPrompts, areaBlock: string): string {
  return prompts.task.text.replace(readerPlaceholders.task, () => areaBlock).trimEnd();
}

export function turnsLeftMessage(prompts: ReaderPrompts, turns: number): string {
  return prompts.turnsLeft.text.replace(readerPlaceholders.turnsLeft, String(turns)).trimEnd();
}

/** RNF-004: what the run manifest records about the reader's prompts, by file name. */
export function promptVersionsOf(prompts: ReaderPrompts): Record<string, PromptVersion> {
  const files = [
    prompts.system,
    prompts.cardFormat,
    prompts.task,
    prompts.turnsLeft,
    prompts.repair,
    prompts.continue,
  ];
  return Object.fromEntries(
    files.map((file) => [file.name, { version: file.version, sha256: file.sha256 }]),
  );
}
