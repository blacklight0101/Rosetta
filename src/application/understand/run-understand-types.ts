import type { PromptFile } from '../agent/prompt-file.js';
import type { ReaderPrompts } from '../agent/reader-prompts.js';
import type { ScannedSource } from '../ports/scan-results.js';
import type { Project } from '../projects/project.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { VerifierPrompts } from '../verifier/verifier-prompts.js';
import type { Rerun } from './answer-rerun.js';
import type { RetryLink } from './retry-plan.js';
import type { ResumePlan } from './resume-plan.js';
import type { ReaderTask } from './reader-tasks.js';

/** What a run needs before its tasks can start. */
export interface Prepared {
  readonly project: Project;
  readonly scanned: ScannedSource;
  /** The tasks this session runs, and every task of the run in area order (RF-006). */
  readonly plan: ResumePlan;
  readonly allTasks: readonly ReaderTask[];
  readonly prompts: ReaderPrompts;
  readonly mergePrompt: PromptFile;
  /** RF-264: the summariser's overview prompt. */
  readonly overviewPrompt: PromptFile;
  /** RF-301: the prompts of the judgement step. */
  readonly verifierPrompts: VerifierPrompts;
  readonly rerun?: Rerun;
  /** RF-208: the run this one retries; absent for any other run. */
  readonly retry?: RetryLink;
}

export interface UnderstandRoles {
  readonly reader: RoleProvider;
  readonly verifier: RoleProvider;
  readonly summariser: RoleProvider;
}
