import type { PromptVersion } from '../../domain/runs/run-manifest.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { promptVersionsOf, type ReaderPrompts } from '../agent/reader-prompts.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import { rolesUseTextToolProtocol } from './understand-options.js';

// RNF-004, RF-205, RF-241: the prompt files an understand run uses and the versions it records: the
// reader's, the text tool protocol when a role uses it, and the answers prompt when a re-run with
// answers has a task to run.

export interface PromptSources {
  readonly prompts: () => Promise<ReaderPrompts>;
  readonly textToolProtocol: () => Promise<PromptFile>;
  readonly answersPrompt: () => Promise<PromptFile>;
}

export async function runPrompts(
  sources: PromptSources,
  settings: ProjectSettings,
  withAnswers: boolean,
): Promise<{
  readonly prompts: ReaderPrompts;
  readonly versions: Record<string, PromptVersion>;
}> {
  const read = await sources.prompts();
  const prompts = withAnswers ? { ...read, answers: await sources.answersPrompt() } : read;
  const versions = promptVersionsOf(prompts);
  if (!rolesUseTextToolProtocol(settings)) return { prompts, versions };
  const { name, version, sha256 } = await sources.textToolProtocol();
  return { prompts, versions: { ...versions, [name]: { version, sha256 } } };
}
