import { ok } from '../../domain/errors/result.js';
import { recordPromptVersions } from '../../domain/runs/run-manifest.js';
import { areaHoldsWorkbook } from '../../domain/sources/workbook-folders.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { ReaderPrompts } from '../agent/reader-prompts.js';
import type { ScannedSource } from '../ports/scan-results.js';
import type { Project } from '../projects/project.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import { verifierPromptVersions, type VerifierPrompts } from '../verifier/verifier-prompts.js';
import type { Rerun } from './answer-rerun.js';
import type { ReaderTask } from './reader-tasks.js';
import { runMarks } from './run-marks.js';
import { runPrompts, type PromptSources } from './run-prompts.js';
import type { UnderstandOptions } from './understand-options.js';

// RNF-004, RF-264, RF-301: the prompt files an understand run reads before its tasks start, and the
// versions it records in its manifest.

export interface RunTextSources extends PromptSources {
  readonly mergePrompt: () => Promise<PromptFile>;
  readonly overviewPrompt: () => Promise<PromptFile>;
  readonly verifierPrompts: () => Promise<VerifierPrompts>;
  /** P5-34, RNF-004: the note a masked value is replaced with, recorded with the other prompts. */
  readonly maskedValuePrompt: () => Promise<PromptFile>;
}

/** The prompt files the run reads. */
export interface RunTexts {
  readonly prompts: ReaderPrompts;
  readonly mergePrompt: PromptFile;
  readonly overviewPrompt: PromptFile;
  readonly verifierPrompts: VerifierPrompts;
}

export async function recordRunTexts(
  sources: RunTextSources,
  updates: ManifestUpdates,
  input: {
    readonly project: Project;
    readonly scanned: ScannedSource;
    readonly tasks: readonly ReaderTask[];
    readonly options: UnderstandOptions;
    readonly rerun: Rerun | undefined;
  },
): Promise<RunTexts> {
  const { project, scanned, tasks, options, rerun } = input;
  const workbook = tasks.some((task) => areaHoldsWorkbook(task.area, scanned.workbookFolders));
  const withAnswers = rerun !== undefined && tasks.length > 0 && rerun.plan.pending.length > 0;
  const use = { withAnswers, deepen: !!options.deepen, workbook };
  const marks = runMarks(tasks, scanned.codeMap);
  const { prompts, versions } = await runPrompts(sources, project.settings, use, marks);
  const [mergePrompt, overviewPrompt, verifierPrompts, masked] = await Promise.all([
    sources.mergePrompt(),
    sources.overviewPrompt(),
    sources.verifierPrompts(),
    sources.maskedValuePrompt(),
  ]);
  const all = {
    ...versions,
    ...verifierPromptVersions(verifierPrompts),
    [masked.name]: { version: masked.version, sha256: masked.sha256 },
  };
  await updates.update((stored) => ok(recordPromptVersions(stored, all)));
  return { prompts, mergePrompt, overviewPrompt, verifierPrompts };
}
