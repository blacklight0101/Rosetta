import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { RunStage } from '../../domain/runs/run-states.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { SubmitRun, SubmittedRun } from './submit-run.js';

// RF-003, RF-1108, RF-1105: Start run is what `POST /api/projects/:id/runs` calls. It finds the
// signed-in user's project (another user's id and an unknown id answer the same) and submits a run
// of a stage whose use case exists. Each stage card adds its stage to `STARTABLE_STAGES`.

/** The stages that can be started through the API: `scan` (P1-23). */
const STARTABLE_STAGES: readonly RunStage[] = ['scan'];

export interface StartRunDependencies {
  readonly projects: ProjectRepository;
  readonly submit: SubmitRun;
  /** The host of the server's Ollama (`ROSETTA_OLLAMA_URL`); an Ollama elsewhere needs consent (RF-143). */
  readonly ollamaHost?: string;
}

export interface StartRunRequest {
  readonly actor: Actor;
  readonly projectId: string;
  readonly stage: RunStage;
  /** `understand`: only these areas (RF-200); every area when absent. */
  readonly areas?: readonly string[];
  /** RF-143: the consent to send code to the cloud providers the run's roles use. */
  readonly cloudConsent?: boolean;
}

export type StartRunProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.runStageNotAvailable
  | typeof ERROR_CODES.cloudConsentMissing;

export class StartRun {
  private readonly deps: StartRunDependencies;

  constructor(deps: StartRunDependencies) {
    this.deps = deps;
  }

  // RF-1108, RF-1105
  async execute(request: StartRunRequest): Promise<Result<SubmittedRun, StartRunProblem>> {
    const { actor, projectId, stage } = request;
    const project = await this.deps.projects.find(actor.userId, projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    if (!STARTABLE_STAGES.includes(stage)) return err(ERROR_CODES.runStageNotAvailable);
    // The scan settings of this moment are the run's: an edit while it waits does not change it.
    const options = stage === 'scan' ? { scanSettings: project.settings.scan } : {};
    return this.deps.submit.execute({ actor, project, stage, options });
  }
}
