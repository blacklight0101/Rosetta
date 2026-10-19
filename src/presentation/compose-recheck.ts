import type { AgentRole } from '../application/ports/llm-provider.js';
import type { Logger } from '../application/ports/logger.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { RunExecutor } from '../application/ports/run-executor.js';
import { PrivateCodeRecheck } from '../application/runs/private-code-recheck.js';
import { UNDERSTAND_ROLES } from '../application/understand/understand-options.js';
import { ollamaHostOf } from './compose-understand.js';

// RF-132, DEC-151: a queued run judges the private-code confirmation again when it starts. The
// executors of the two stages that call models are wrapped here, each with the roles its stage calls
// (a plan run calls the planner only); the scan calls no model and is not wrapped.

export interface RecheckParts {
  readonly projects: Pick<ProjectRepository, 'find'>;
  readonly logger: Logger;
  readonly ollamaUrl: string | undefined;
}

export interface ModelExecutors {
  readonly understand: RunExecutor;
  readonly plan: RunExecutor;
}

// RF-132
export function withPrivateCodeRecheck(
  executors: ModelExecutors,
  parts: RecheckParts,
): ModelExecutors {
  const { projects, logger } = parts;
  const ollamaHost = ollamaHostOf(parts.ollamaUrl);
  const wrap = (inner: RunExecutor, roles: readonly AgentRole[]): RunExecutor =>
    new PrivateCodeRecheck({
      ...{ inner, projects, logger, roles },
      ...(ollamaHost === undefined ? {} : { ollamaHost }),
    });
  return {
    understand: wrap(executors.understand, UNDERSTAND_ROLES),
    plan: wrap(executors.plan, ['planner']),
  };
}
