import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PromptFile } from '../../application/agent/prompt-file.js';
import { STYLES_PLACEHOLDER } from '../../application/planning/plan-options-request.js';
import { readerPlaceholders, type ReaderPrompts } from '../../application/agent/reader-prompts.js';
import { secretRiskPlaceholders } from '../../domain/planning/secret-risks.js';
import { holdsDataMarker } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RNF-004, RF-145: prompts are versioned files under the prompts folder, never strings in code. A
// change creates a new version file and the names below change with it. Each file is read once,
// with the SHA-256 of its bytes for the run manifest. A template that lost its placeholder, or a
// prompt that holds a data block marker (the egress guard would refuse every call), is refused
// before any run uses it.

const readerPromptNames = {
  system: 'reader/area.v12.md',
  cardFormat: 'cards/card-format.v3.md',
  task: 'reader/task.v2.md',
  turnsLeft: 'reader/turns-left.v2.md',
  repair: 'cards/repair.v4.md',
  continue: 'cards/continue.v1.md',
  readFirst: 'reader/read-first.v1.md',
  readMore: 'reader/read-more.v1.md',
} as const;

/** RF-155: added only to areas that hold a rendered workbook. */
const workbookPromptName = 'reader/workbook.v5.md';

const answersPromptName = 'reader/answers.v1.md';
const rereadPromptName = 'reader/reread.v4.md';
const parentCardsPromptName = 'reader/parent-cards.v2.md';

/** RF-260, RF-261: fragments of the card format, added only to areas the code map marks (Q-25). */
const surfacePromptNames = { flows: 'cards/flows.v1.md', screens: 'cards/screens.v2.md' } as const;

const versionPattern = /\.(v\d+)\.md$/;

function invalid(name: string, problem: string): RosettaError {
  return new RosettaError(ERROR_CODES.configurationInvalid, `The prompt ${name} ${problem}.`);
}

/** The checked and hashed file made of the bytes read from `name`. */
function promptFileOf(name: string, bytes: Buffer): PromptFile {
  const version = versionPattern.exec(name)?.[1];
  if (version === undefined) throw invalid(name, 'has no version in its file name');
  const text = bytes.toString('utf8');
  if (holdsDataMarker(text)) throw invalid(name, 'holds a data block marker');
  return { name, version, sha256: createHash('sha256').update(bytes).digest('hex'), text };
}

/** Reads one prompt file; `name` is its path under the prompts folder (`reader/area.v2.md`). */
export async function loadPromptFile(promptsFolder: string, name: string): Promise<PromptFile> {
  return promptFileOf(name, await readFile(join(promptsFolder, ...name.split('/'))));
}

/** P5-34: the same, read at once, for the one file the composition root needs before it starts. */
export function loadPromptFileSync(promptsFolder: string, name: string): PromptFile {
  // eslint-disable-next-line n/no-sync -- one small file read before the server starts; the masker is built with it.
  return promptFileOf(name, readFileSync(join(promptsFolder, ...name.split('/'))));
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
  return loadPromptFile(promptsFolder, 'summariser/merge.v2.md');
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
  return loadPromptFile(promptsFolder, 'planner/package.v9.md');
}

/**
 * P3-117: the text of every planner prompt file of every version, which models may have learned to
 * copy from. The package check reads the example sentences out of them; none is sent to a model.
 */
// RNF-004
export async function loadPlannerPromptTexts(promptsFolder: string): Promise<string[]> {
  const folder = join(promptsFolder, 'planner');
  const names = (await readdir(folder)).filter((name) => versionPattern.test(name)).sort();
  return Promise.all(names.map((name) => readFile(join(folder, name), 'utf8')));
}

/** The planner's guidance for a plan that rebuilds workbooks as an application (RF-155), checked and hashed. */
// RNF-004
export function loadPlannerWorkbookPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/workbook.v1.md');
}

/** The planner's prompt that asks a cut-off answer to go on (RF-604), checked and hashed. */
// RNF-004
export function loadPlannerContinuePrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/continue.v1.md');
}

/** The planner's prompt for the product requirements document (RF-621), checked and hashed. */
// RNF-004
export function loadPrdPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/prd.v4.md');
}

/** The planner's prompt for the target data model (RF-623), checked and hashed. */
// RNF-004
export function loadDataModelPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/data-model.v4.md');
}

/** The planner's prompt for the target flows (RF-625), checked and hashed. */
// RNF-004
export function loadFlowsPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/flows.v2.md');
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

/** The planner's prompt for linking the task cards to the items they build (RF-627), checked and hashed. */
// RNF-004
export function loadCoveragePrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/coverage.v1.md');
}

/** The planner's prompt for the task cards of the items no card builds (Q-45), checked and hashed. */
// RNF-004
export function loadGapPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/gap.v2.md');
}

/** The planner's prompt for the one repair attempt of the gap call (Q-54), checked and hashed. */
// RNF-004
export function loadGapRepairPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/gap-repair.v2.md');
}

/**
 * P5-34, RF-608: the wording of the plan risk for a file that holds a masked secret, with the path
 * and the lines as placeholders. The domain fills it; no model is asked.
 */
// RNF-004
export async function loadPlannerSecretRiskPrompt(promptsFolder: string): Promise<PromptFile> {
  const file = await loadPromptFile(promptsFolder, 'shared/secret-risk.v1.md');
  return requirePlaceholders(file, [secretRiskPlaceholders.path, secretRiskPlaceholders.lines]);
}

/** The planner's prompt for the one repair attempt of the plan answer (P3-126), checked and hashed. */
// RNF-004
export function loadPlanRepairPrompt(promptsFolder: string): Promise<PromptFile> {
  return loadPromptFile(promptsFolder, 'planner/plan-repair.v1.md');
}

function requirePlaceholders(file: PromptFile, placeholders: readonly string[]): PromptFile {
  return placeholders.reduce(requirePlaceholder, file);
}

/** The reader's prompt files (RF-201), checked and hashed. */
// RNF-004
export async function loadReaderPrompts(promptsFolder: string): Promise<ReaderPrompts> {
  const load = (name: string) => loadPromptFile(promptsFolder, name);
  const [
    system,
    cardFormat,
    task,
    turnsLeft,
    repair,
    resume,
    flows,
    screens,
    readFirst,
    readMore,
    workbook,
  ] = await Promise.all([
    load(readerPromptNames.system),
    load(readerPromptNames.cardFormat),
    load(readerPromptNames.task),
    load(readerPromptNames.turnsLeft),
    load(readerPromptNames.repair),
    load(readerPromptNames.continue),
    load(surfacePromptNames.flows),
    load(surfacePromptNames.screens),
    load(readerPromptNames.readFirst),
    load(readerPromptNames.readMore),
    load(workbookPromptName),
  ]);
  return {
    system,
    cardFormat,
    task: requirePlaceholder(task, readerPlaceholders.task),
    turnsLeft: requirePlaceholder(turnsLeft, readerPlaceholders.turnsLeft),
    repair: requirePlaceholder(repair, readerPlaceholders.repair),
    continue: resume,
    surface: { flows, screens },
    workbook,
    readFirst: requirePlaceholders(readFirst, [
      readerPlaceholders.readFirstFiles,
      readerPlaceholders.readFirstTurns,
    ]),
    readMore: requirePlaceholders(readMore, [
      readerPlaceholders.readMorePercent,
      readerPlaceholders.readMoreRead,
      readerPlaceholders.readMoreTotal,
      readerPlaceholders.readMoreFiles,
      readerPlaceholders.readMoreTurns,
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

/** The prompt that lists the parent's cards to a Deepen reader (RF-209, DEC-158), checked and hashed. */
export async function loadParentCardsPrompt(promptsFolder: string): Promise<PromptFile> {
  const file = await loadPromptFile(promptsFolder, parentCardsPromptName);
  return requirePlaceholder(file, readerPlaceholders.parentCards);
}
