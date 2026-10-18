import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PromptFile } from '../../application/agent/prompt-file.js';
import { STYLES_PLACEHOLDER } from '../../application/planning/plan-options-request.js';
import { readerPlaceholders, type ReaderPrompts } from '../../application/agent/reader-prompts.js';
import { holdsDataMarker } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RNF-004, RF-145: prompts are versioned files under the prompts folder, never strings in code. A
// change creates a new version file and the names below change with it. Each file is read once,
// with the SHA-256 of its bytes for the run manifest. A template that lost its placeholder, or a
// prompt that holds a data block marker (the egress guard would refuse every call), is refused
// before any run uses it.

const readerPromptNames = {
  system: 'reader/area.v3.md',
  cardFormat: 'cards/card-format.v2.md',
  task: 'reader/task.v2.md',
  turnsLeft: 'reader/turns-left.v2.md',
  repair: 'cards/repair.v1.md',
  continue: 'cards/continue.v1.md',
  readFirst: 'reader/read-first.v1.md',
} as const;

const answersPromptName = 'reader/answers.v1.md';
const rereadPromptName = 'reader/reread.v1.md';

/** RF-260, RF-261: fragments of the card format, added only to areas the code map marks (Q-25). */
const surfacePromptNames = { flows: 'cards/flows.v1.md', screens: 'cards/screens.v1.md' } as const;

const versionPattern = /\.(v\d+)\.md$/;

function invalid(name: string, problem: string): RosettaError {
  return new RosettaError(ERROR_CODES.configurationInvalid, `The prompt ${name} ${problem}.`);
}

/** Reads one prompt file; `name` is its path under the prompts folder (`reader/area.v2.md`). */
export async function loadPromptFile(promptsFolder: string, name: string): Promise<PromptFile> {
  const version = versionPattern.exec(name)?.[1];
  if (version === undefined) throw invalid(name, 'has no version in its file name');
  const bytes = await readFile(join(promptsFolder, ...name.split('/')));
  const text = bytes.toString('utf8');
  if (holdsDataMarker(text)) throw invalid(name, 'holds a data block marker');
  return { name, version, sha256: createHash('sha256').update(bytes).digest('hex'), text };
}

export function requirePlaceholder(file: PromptFile, placeholder: string): PromptFile {
  if (file.text.split(placeholder).length !== 2) {
    throw invalid(file.name, `must hold the placeholder ${placeholder} exactly once`);
  }
  return file;
}

/** The summariser's merge prompt (RF-250), checked and hashed. */
// RNF-004
export function loadMergePrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'summariser/merge.v1.md');
}

/** The summariser's overview prompt (RF-264), checked and hashed. */
// RNF-004
export function loadOverviewPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'summariser/overview.v1.md');
}

/** The planner's prompt for the architecture and stack options (RF-608, RF-609), checked and hashed. */
// RNF-004
export async function loadPlanOptionsPrompt(promptsFolder: string): Promise<PromptFile> {
  const file = await loadPromptFile(promptsFolder, 'planner/options.v1.md');
  return requirePlaceholder(file, STYLES_PLACEHOLDER);
}

/** The planner's prompt for the hand-off package (RF-604), checked and hashed. */
// RNF-004
export function loadPlannerPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/package.v4.md');
}

/** The planner's prompt that asks a cut-off answer to go on (RF-604), checked and hashed. */
// RNF-004
export function loadPlannerContinuePrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/continue.v1.md');
}

/** The planner's prompt for the product requirements document (RF-621), checked and hashed. */
// RNF-004
export function loadPrdPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/prd.v1.md');
}

/** The planner's prompt for the target data model (RF-623), checked and hashed. */
// RNF-004
export function loadDataModelPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/data-model.v1.md');
}

/** The planner's prompt for the target flows (RF-625), checked and hashed. */
// RNF-004
export function loadFlowsPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/flows.v1.md');
}

/** The planner's prompt for the API contract (RF-624), checked and hashed. */
// RNF-004
export function loadApiContractPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/api-contract.v1.md');
}

/** The planner's prompt for the user-interface material (RF-626), checked and hashed. */
// RNF-004
export function loadUxPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/ux.v1.md');
}

function requirePlaceholders(file: PromptFile, placeholders: readonly string[]): PromptFile {
  return placeholders.reduce(requirePlaceholder, file);
}

/** The reader's prompt files (RF-201), checked and hashed. */
// RNF-004
export async function loadReaderPrompts(promptsFolder: string): Promise<ReaderPrompts> {
  const load = (name: string) => loadPromptFile(promptsFolder, name);
  const [system, cardFormat, task, turnsLeft, repair, resume, flows, screens, readFirst] =
    await Promise.all([
      load(readerPromptNames.system),
      load(readerPromptNames.cardFormat),
      load(readerPromptNames.task),
      load(readerPromptNames.turnsLeft),
      load(readerPromptNames.repair),
      load(readerPromptNames.continue),
      load(surfacePromptNames.flows),
      load(surfacePromptNames.screens),
      load(readerPromptNames.readFirst),
    ]);
  return {
    system,
    cardFormat,
    task: requirePlaceholder(task, readerPlaceholders.task),
    turnsLeft: requirePlaceholder(turnsLeft, readerPlaceholders.turnsLeft),
    repair: requirePlaceholder(repair, readerPlaceholders.repair),
    continue: resume,
    surface: { flows, screens },
    readFirst: requirePlaceholders(readFirst, [
      readerPlaceholders.readFirstFiles,
      readerPlaceholders.readFirstTurns,
    ]),
  };
}

/** The prompt that carries the owner's answers to a re-run reader (RF-241), checked and hashed. */
export async function loadAnswersPrompt(promptsFolder: string): Promise<PromptFile> {
  const file = await loadPromptFile(promptsFolder, answersPromptName);
  return requirePlaceholder(file, readerPlaceholders.answers);
}

/** The prompt that carries the rejected claims to a Deepen re-read (RF-209), checked and hashed. */
export async function loadRereadPrompt(promptsFolder: string): Promise<PromptFile> {
  const file = await loadPromptFile(promptsFolder, rereadPromptName);
  return requirePlaceholder(file, readerPlaceholders.reread);
}
