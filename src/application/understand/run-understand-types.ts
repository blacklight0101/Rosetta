import type { PromptFile } from '../agent/prompt-file.js';
import type { ReaderPrompts } from '../agent/reader-prompts.js';
import type { ScannedSource } from '../ports/scan-results.js';
import type { Project } from '../projects/project.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { Rerun } from './answer-rerun.js';
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
  readonly rerun?: Rerun;
}

export interface UnderstandRoles {
  readonly reader: RoleProvider;
  readonly summariser: RoleProvider;
}
