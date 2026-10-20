import type { AreaMarks } from '../../domain/code-map/area-surface.js';
import type { PromptVersion } from '../../domain/runs/run-manifest.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { promptVersionsOf, type ReaderPrompts } from '../agent/reader-prompts.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import { rolesUseTextToolProtocol } from './understand-options.js';

// RNF-004, RF-205, RF-241, RF-155, Q-25: the prompt files an understand run uses and the versions it records:
// the reader's, the flows and screens fragments when some area is marked for them, the workbook
// guidance when some area holds a rendered workbook, the text tool
// protocol when a role uses it, the answers prompt when a re-run with answers has a task to run,
// and the re-read prompt of a Deepen (RF-209).

export interface PromptSources {
  readonly prompts: () => Promise<ReaderPrompts>;
  readonly textToolProtocol: () => Promise<PromptFile>;
  readonly answersPrompt: () => Promise<PromptFile>;
  readonly rereadPrompt: () => Promise<PromptFile>;
}

/** Which optional prompts the run uses: the answers (RF-241) and the Deepen re-read (RF-209). */
interface PromptUse {
  readonly withAnswers: boolean;
  readonly deepen: boolean;
  /** RF-155: some area of the run holds a rendered workbook, so a task uses the workbook guidance. */
  readonly workbook: boolean;
}

export async function runPrompts(
  sources: PromptSources,
  settings: ProjectSettings,
  use: PromptUse,
  marks: AreaMarks,
): Promise<{
  readonly prompts: ReaderPrompts;
  readonly versions: Record<string, PromptVersion>;
}> {
  const read = await sources.prompts();
  const answers = use.withAnswers ? { answers: await sources.answersPrompt() } : {};
  const reread = use.deepen ? { reread: await sources.rereadPrompt() } : {};
  const prompts = { ...read, ...answers, ...reread };
  const versions = promptVersionsOf(prompts, marks, use.workbook);
  if (!rolesUseTextToolProtocol(settings)) return { prompts, versions };
  const { name, version, sha256 } = await sources.textToolProtocol();
  return { prompts, versions: { ...versions, [name]: { version, sha256 } } };
}
