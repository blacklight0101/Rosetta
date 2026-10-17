import type { AreaMarks } from '../../domain/code-map/area-surface.js';
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
  /** `reader/answers.v<n>.md`: the owner's answers; present for a re-run with answers (RF-241). */
  readonly answers?: PromptFile;
  /** `cards/flows.v<n>.md` and `cards/screens.v<n>.md`: added only to areas the code map marks (Q-25). */
  readonly surface?: SurfacePrompts;
}

/** RF-260, RF-261: the two card types a marked area may also write, one prompt fragment each. */
export interface SurfacePrompts {
  readonly flows: PromptFile;
  readonly screens: PromptFile;
}

/** The one placeholder each template prompt must hold. */
export const readerPlaceholders = {
  task: '{{area}}',
  turnsLeft: '{{turns}}',
  repair: '{{problems}}',
  answers: '{{answers}}',
} as const;

/** The same on every turn, so providers that cache a stable prefix charge less for it. */
export function readerSystemPrompt(prompts: ReaderPrompts): string {
  return `${prompts.system.text}\n\n${prompts.cardFormat.text}`;
}

/**
 * The first user message: the task text with the area's data block in place of its placeholder,
 * and for a re-run with answers the answers prompt with their data block (RF-241).
 */
export function readerTaskMessage(
  prompts: ReaderPrompts,
  areaBlock: string,
  answersBlock?: string,
): string {
  const task = prompts.task.text.replace(readerPlaceholders.task, () => areaBlock).trimEnd();
  if (answersBlock === undefined || prompts.answers === undefined) return task;
  const answers = prompts.answers.text
    .replace(readerPlaceholders.answers, () => answersBlock)
    .trimEnd();
  return `${task}

${answers}`;
}

export function turnsLeftMessage(prompts: ReaderPrompts, turns: number): string {
  return prompts.turnsLeft.text.replace(readerPlaceholders.turnsLeft, String(turns)).trimEnd();
}

/** Q-25: the prompts of a task over an area with these marks (the same prompts when it has none). */
export function readerPromptsFor(prompts: ReaderPrompts, marks: AreaMarks): ReaderPrompts {
  return marks.flows && marks.screens ? { ...prompts } : prompts;
}

/** RNF-004: what the run manifest records about the reader's prompts, by file name. */
export function promptVersionsOf(
  prompts: ReaderPrompts,
  marks?: AreaMarks,
): Record<string, PromptVersion> {
  const given = marks === undefined ? prompts : readerPromptsFor(prompts, marks);
  const files = [
    given.system,
    prompts.cardFormat,
    prompts.task,
    prompts.turnsLeft,
    prompts.repair,
    prompts.continue,
    ...(prompts.answers === undefined ? [] : [prompts.answers]),
  ];
  return Object.fromEntries(
    files.map((file) => [file.name, { version: file.version, sha256: file.sha256 }]),
  );
}
