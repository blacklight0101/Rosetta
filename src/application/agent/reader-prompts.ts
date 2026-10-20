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
  /** `reader/reread.v<n>.md`: the rejected claims a Deepen re-reads, with the reasons (RF-209). */
  readonly reread?: PromptFile;
  /** `reader/parent-cards.v<n>.md`: the parent's cards a Deepen task adds to (RF-209, DEC-158). */
  readonly parentCards?: PromptFile;
  /** `cards/flows.v<n>.md` and `cards/screens.v<n>.md`: added only to areas the code map marks (Q-25). */
  readonly surface?: SurfacePrompts;

  /** `reader/workbook.v<n>.md`: added only to areas that hold a rendered workbook (RF-155). */
  readonly workbook?: PromptFile;

  /** `reader/read-first.v<n>.md`: refuses an answer given before any file of the area was read (RF-206). */
  readonly readFirst: PromptFile;
}

/** RF-260, RF-261: the two card types a marked area may also write, one prompt fragment each. */
interface SurfacePrompts {
  readonly flows: PromptFile;
  readonly screens: PromptFile;
}

/** The one placeholder each template prompt must hold. */
export const readerPlaceholders = {
  task: '{{area}}',
  turnsLeft: '{{turns}}',
  repair: '{{problems}}',
  answers: '{{answers}}',
  reread: '{{rejected}}',
  parentCards: '{{parentCards}}',
  readFirstFiles: '{{files}}',
  readFirstTurns: '{{turns}}',
} as const;

/** The same on every turn, so providers that cache a stable prefix charge less for it. */
export function readerSystemPrompt(prompts: ReaderPrompts): string {
  return `${prompts.system.text}\n\n${prompts.cardFormat.text}`;
}

/** The template with its one placeholder replaced by the block, or nothing without both. */
function filled(
  template: PromptFile | undefined,
  placeholder: string,
  block: string | undefined,
): readonly string[] {
  if (template === undefined || block === undefined) return [];
  return [template.text.replace(placeholder, () => block).trimEnd()];
}

/**
 * The first user message: the task text with the area's data block in place of its placeholder,
 * for a re-run with answers the answers prompt with their data block (RF-241), and for a Deepen
 * re-read the rejected claims with the verifier's reasons in theirs (RF-209).
 */
export function readerTaskMessage(
  prompts: ReaderPrompts,
  areaBlock: string,
  answersBlock?: string,
  rejectedBlock?: string,
): string {
  const task = prompts.task.text.replace(readerPlaceholders.task, () => areaBlock).trimEnd();
  return [
    task,
    ...filled(prompts.answers, readerPlaceholders.answers, answersBlock),
    ...filled(prompts.reread, readerPlaceholders.reread, rejectedBlock),
  ].join('\n\n');
}

export function turnsLeftMessage(prompts: ReaderPrompts, turns: number): string {
  return prompts.turnsLeft.text.replace(readerPlaceholders.turnsLeft, String(turns)).trimEnd();
}

/** RF-206: the refusal of an answer given before any read, with the unread files as a data block. */
export function readFirstMessage(
  prompts: ReaderPrompts,
  filesBlock: string,
  turns: number,
): string {
  // The turns first: the files block holds repository text, which must not be read as a placeholder.
  return prompts.readFirst.text
    .replace(readerPlaceholders.readFirstTurns, String(turns))
    .replace(readerPlaceholders.readFirstFiles, () => filesBlock)
    .trimEnd();
}

/** The fragments an area with these marks gets, flows first. */
function surfaceFilesFor(prompts: ReaderPrompts, marks: AreaMarks): readonly PromptFile[] {
  const { surface } = prompts;
  if (surface === undefined) return [];
  return [...(marks.flows ? [surface.flows] : []), ...(marks.screens ? [surface.screens] : [])];
}

/** RF-155: a workbook area is asked for FLOW and SCRN cards, so it gets both formats. */
const WORKBOOK_MARKS: AreaMarks = { flows: true, screens: true };

/** The guidance file, when the area holds a workbook and the run loaded it. */
function guidanceFor(prompts: ReaderPrompts, workbook: boolean): readonly PromptFile[] {
  return workbook && prompts.workbook !== undefined ? [prompts.workbook] : [];
}

/**
 * Q-25, RF-155: the prompts of a task over an area with these marks. A marked area gets the flows
 * and screens fragments after the card format; an area that holds a rendered workbook gets both
 * fragments and then the workbook guidance; any other area gets the very same prompts, so a
 * library, a GitHub run or a zip without workbooks costs nothing extra.
 */
export function readerPromptsFor(
  prompts: ReaderPrompts,
  marks: AreaMarks,
  workbook = false,
): ReaderPrompts {
  const guidance = guidanceFor(prompts, workbook);
  const fragments = surfaceFilesFor(prompts, guidance.length > 0 ? WORKBOOK_MARKS : marks);
  const added = [...fragments, ...guidance];
  if (added.length === 0) return prompts;
  const text = [prompts.cardFormat.text.trimEnd(), ...added.map((file) => file.text.trim())];
  const joined = `${text.join('\n\n')}\n`;
  return { ...prompts, cardFormat: { ...prompts.cardFormat, text: joined } };
}

/**
 * RNF-004: what the run manifest records about the reader's prompts, by file name. `marks` says
 * whether any area of the run is marked for flows or screens, and `workbook` whether any area holds
 * a rendered workbook: only the fragments and the guidance some task used are recorded.
 */
export function promptVersionsOf(
  prompts: ReaderPrompts,
  marks: AreaMarks = { flows: false, screens: false },
  workbook = false,
): Record<string, PromptVersion> {
  const guidance = guidanceFor(prompts, workbook);
  const used = guidance.length > 0 ? WORKBOOK_MARKS : marks;
  const files = [
    prompts.system,
    prompts.cardFormat,
    prompts.task,
    prompts.turnsLeft,
    prompts.repair,
    prompts.continue,
    ...(prompts.answers === undefined ? [] : [prompts.answers]),
    ...(prompts.reread === undefined ? [] : [prompts.reread]),
    ...surfaceFilesFor(prompts, used),
    ...guidance,
    prompts.readFirst,
  ];
  return Object.fromEntries(
    files.map((file) => [file.name, { version: file.version, sha256: file.sha256 }]),
  );
}
