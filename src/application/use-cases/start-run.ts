import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { RunStage } from '../../domain/runs/run-states.js';
import type { AgentRole } from '../ports/llm-provider.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import { planSourceRun } from '../plan/plan-source.js';
import type { Project } from '../projects/project.js';
import { rolesNeedCloudConsent, understandOptionsOf } from '../understand/understand-options.js';
import type { SubmitRun, SubmittedRun } from './submit-run.js';

// RF-003, RF-1108, RF-1105, RF-143, RF-200: Start run is what `POST /api/projects/:id/runs` calls.
// It finds the signed-in user's project (another user's id and an unknown id answer the same) and
// submits a run of a stage whose use case exists. Each stage card adds its stage to
// `STARTABLE_STAGES`. An understand run records its areas and the cloud consent; when its roles
// would send code off this machine and the request has no consent, it is refused (RST-1515)
// before any run exists, so nothing can be sent (RF-143).

/** The stages that can be started through the API: `scan` (P1-23), `understand` (P1-33) and `plan` (P3-08). */
const STARTABLE_STAGES: readonly RunStage[] = ['scan', 'understand', 'plan'];

export interface StartRunDependencies {
  readonly projects: ProjectRepository;
  /** RF-614: a plan run's source run must be the user's, of the project and completed. */
  readonly runs: Pick<RunIndex, 'find' | 'list'>;
  /** RST-1801: a plan run needs the brief the owner saved. */
  readonly briefs: Pick<PlanningBriefStore, 'read'>;
  readonly submit: SubmitRun;
  /** The host of the server's Ollama (`ROSETTA_OLLAMA_URL`); an Ollama elsewhere needs consent (RF-143). */
  readonly ollamaHost?: string;
}

export interface StartRunRequest {
  readonly actor: Actor;
  readonly projectId: string;
  readonly stage: RunStage;
  /** `understand`: only these areas (RF-200); every area when absent or empty. */
  readonly areas?: readonly string[];
  /** RF-143: the consent to send code to the cloud providers the run's roles use. */
  readonly cloudConsent?: boolean;
  /** RF-241: `understand` runs again the areas of the answered questions, with the answers. */
  readonly withAnswers?: boolean;
  /** RF-614: `plan` is written from this understand run (its id); the newest completed one when absent. */
  readonly sourceRunId?: string;
}

export type StartRunProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.runStageNotAvailable
  | typeof ERROR_CODES.cloudConsentMissing
  | typeof ERROR_CODES.planBriefMissing
  | typeof ERROR_CODES.planSourceMissing;

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
    if (stage === 'understand') return this.understand(request, project);
    if (stage === 'plan') return this.plan(request, project);
    // The scan settings of this moment are the run's: an edit while it waits does not change it.
    const options = { scanSettings: project.settings.scan };
    return this.deps.submit.execute({ actor, project, stage, options });
  }

  // RF-143, RF-604: a plan run calls the planner only, so only the planner needs the consent; the
  // source run is read by the run itself (RST-1802), a named one is checked here (RF-614); the saved
  // brief is checked here (RST-1801).
  private async plan(
    request: StartRunRequest,
    project: Project,
  ): Promise<Result<SubmittedRun, StartRunProblem>> {
    // RST-1801: no run is created for a project whose owner has saved no brief.
    const brief = await this.deps.briefs.read({
      userId: request.actor.userId,
      projectId: project.id,
    });
    if (brief === undefined) return err(ERROR_CODES.planBriefMissing);
    // RF-614, RST-1802, RF-1105: a named source run is checked before any run exists.
    const { actor, sourceRunId } = request;
    if (sourceRunId !== undefined) {
      const owner = { userId: actor.userId, projectId: project.id };
      const source = await planSourceRun(this.deps.runs, owner, sourceRunId);
      if (!source.ok) return err(source.error);
    }
    const cloudConsent = request.cloudConsent === true;
    const roles: readonly AgentRole[] = ['planner'];
    if (!cloudConsent && rolesNeedCloudConsent(project.settings, this.deps.ollamaHost, roles)) {
      return err(ERROR_CODES.cloudConsentMissing);
    }
    const options = { cloudConsent, ...(sourceRunId === undefined ? {} : { sourceRunId }) };
    return this.deps.submit.execute({ actor, project, stage: 'plan', options });
  }

  // RF-143, RF-200
  private async understand(
    request: StartRunRequest,
    project: Project,
  ): Promise<Result<SubmittedRun, StartRunProblem>> {
    const options = understandOptionsOf(request);
    if (!options.cloudConsent && rolesNeedCloudConsent(project.settings, this.deps.ollamaHost)) {
      return err(ERROR_CODES.cloudConsentMissing);
    }
    const { actor } = request;
    return this.deps.submit.execute({
      actor,
      project,
      stage: 'understand',
      options: { ...options },
    });
  }
}
