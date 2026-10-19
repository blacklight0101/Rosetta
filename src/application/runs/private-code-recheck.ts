import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { AgentRole } from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunExecution, RunExecutor, RunOutcome } from '../ports/run-executor.js';
import { rolesNeedPrivateConfirmation } from '../understand/understand-options.js';

// RF-132, RF-143, DEC-151: the private-code confirmation is judged when a run is accepted, but a run
// may wait in the queue while the project's roles change. This wraps the executor of a stage that
// calls models: when the run starts it reads the project as it is now, and if a role would send
// private code off this machine and the run was accepted without that confirmation, the run does not
// start. It ends `Failed` with RST-1521 and the log says why; nothing is sent. A GitHub project, a
// project whose roles are local, and a run that holds the confirmation start as before.

export interface PrivateCodeRecheckDependencies {
  readonly inner: RunExecutor;
  readonly projects: Pick<ProjectRepository, 'find'>;
  readonly logger: Logger;
  /** The roles the stage calls (a plan run calls the planner only). */
  readonly roles: readonly AgentRole[];
  /** The host of the server's Ollama; an Ollama elsewhere counts as a cloud provider (DEC-118). */
  readonly ollamaHost?: string;
}

const MESSAGE =
  'The roles of this project changed to a cloud provider after the run was queued, and the ' +
  'private code of this project was not confirmed for it. The run did not start and nothing was ' +
  'sent. Confirm that private code may go to the cloud provider, or switch the roles to Ollama, and start the run again.';

export class PrivateCodeRecheck implements RunExecutor {
  private readonly deps: PrivateCodeRecheckDependencies;

  constructor(deps: PrivateCodeRecheckDependencies) {
    this.deps = deps;
  }

  // RF-132
  async execute(execution: RunExecution): Promise<RunOutcome> {
    const { run, manifest } = execution;
    const { projects, roles, ollamaHost, logger } = this.deps;
    const project = await projects.find(run.userId, run.projectId);
    const confirmed = manifest.options['privateCodeConfirmed'] === true;
    if (
      project !== undefined &&
      !confirmed &&
      rolesNeedPrivateConfirmation(project, ollamaHost, roles)
    ) {
      await logger.log({
        ...{ level: 'error', logger: 'runs', message: MESSAGE },
        ...{ code: ERROR_CODES.privateCodeNotConfirmed, runId: run.runKey, userId: run.userId },
      });
      return { endState: 'Failed', errorCode: ERROR_CODES.privateCodeNotConfirmed };
    }
    return this.deps.inner.execute(execution);
  }
}
