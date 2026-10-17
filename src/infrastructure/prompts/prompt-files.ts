import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PromptFile } from '../../application/agent/prompt-file.js';
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

/** RF-264: red stub, replaced by the implementation in the next commit. */
export function loadOverviewPrompt(promptsFolder: string): Promise<PromptFile> {
  return Promise.reject(new RosettaError(ERROR_CODES.configurationInvalid, promptsFolder));
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
