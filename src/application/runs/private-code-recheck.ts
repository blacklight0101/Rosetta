import type { AgentRole } from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunExecution, RunExecutor, RunOutcome } from '../ports/run-executor.js';

// P3-54 (stub): passes every run through.

export interface PrivateCodeRecheckDependencies {
  readonly inner: RunExecutor;
  readonly projects: Pick<ProjectRepository, 'find'>;
  readonly logger: Logger;
  readonly roles: readonly AgentRole[];
  readonly ollamaHost?: string;
}

export class PrivateCodeRecheck implements RunExecutor {
  private readonly deps: PrivateCodeRecheckDependencies;

  constructor(deps: PrivateCodeRecheckDependencies) {
    this.deps = deps;
  }

  execute(execution: RunExecution): Promise<RunOutcome> {
    return this.deps.inner.execute(execution);
  }
}
