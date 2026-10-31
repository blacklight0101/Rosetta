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
import {
  rolesNeedCloudConsent,
  rolesNeedPrivateConfirmation,
  UNDERSTAND_ROLES,
  understandOptionsOf,
} from '../understand/understand-options.js';
import type { SubmitRun, SubmittedRun } from './submit-run.js';
import { anyRoleWithoutKey, type RoleKeyDependencies } from '../runs/role-keys.js';
import type { ApprovedAmount } from '../understand/understand-options.js';

// RF-003, RF-1108, RF-1105, RF-143, RF-132, RF-200: Start run is what `POST /api/projects/:id/runs` calls.
// It finds the signed-in user's project (another user's id and an unknown id answer the same) and
// submits a run of a stage whose use case exists. Each stage card adds its stage to
// `STARTABLE_STAGES`. An understand run records its areas and the cloud consent; when its roles
// would send code off this machine and the request has no consent, it is refused (RST-1515)
// before any run exists, so nothing can be sent (RF-143). The same run on a project of kind `upload`
// also needs `privateCodeConfirmed: true` (RST-1521, RF-132); a GitHub project never does.

/** The stages that can be started through the API: `scan` (P1-23), `understand` (P1-33) and `plan` (P3-08). */
const STARTABLE_STAGES: readonly RunStage[] = ['scan', 'understand', 'plan'];

/** RF-431: the roles whose keys a startable stage needs; a scan calls no model. */
const MODEL_ROLES_OF: Partial<Record<RunStage, readonly AgentRole[]>> = {
  understand: UNDERSTAND_ROLES,
  plan: ['planner'],
};

export interface StartRunDependencies {
  readonly projects: ProjectRepository;
  /** RF-614: a plan run's source run must be the user's, of the project and completed. */
  readonly runs: Pick<RunIndex, 'find' | 'list'>;
  /** RST-1801: a plan run needs the brief the owner saved. */
  readonly briefs: Pick<PlanningBriefStore, 'read'>;
  readonly submit: SubmitRun;
  /** The host of the server's Ollama (`ROSETTA_OLLAMA_URL`); an Ollama elsewhere needs consent (RF-143). */
  readonly ollamaHost?: string;
  /** RF-431: whether each role of the run has a usable key; checked before the run is queued. */
  readonly roleKeys: RoleKeyDependencies;
}

export interface StartRunRequest {
  readonly actor: Actor;
  readonly projectId: string;
  readonly stage: RunStage;
  /** `understand`: only these areas (RF-200); every area when absent or empty. */
  readonly areas?: readonly string[];
  /** RF-143: the consent to send code to the cloud providers the run's roles use. */
  readonly cloudConsent?: boolean;
  /** RF-132: the second confirmation, for an uploaded project whose roles use a non-local provider. */
  readonly privateCodeConfirmed?: boolean;
  /** RF-241: `understand` runs again the areas of the answered questions, with the answers. */
  readonly withAnswers?: boolean;
  /** RF-614: `plan` is written from this understand run (its id); the newest completed one when absent. */
  readonly sourceRunId?: string;
  /** RF-208, Q-43: `understand` reads `areas` again for this run (its id) and holds its cards. */
  readonly retryOf?: string;
  /** RF-430: the figure the user approved on the start button, recorded as the run's approved amount. */
  readonly approvedAmount?: ApprovedAmount;
}

export type StartRunProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.runStageNotAvailable
  | typeof ERROR_CODES.cloudConsentMissing
  | typeof ERROR_CODES.privateCodeNotConfirmed
  | typeof ERROR_CODES.planBriefMissing
  | typeof ERROR_CODES.planSourceMissing
  | typeof ERROR_CODES.projectNoSource
  | typeof ERROR_CODES.providerKeyMissing
  | typeof ERROR_CODES.requestInvalid;

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
    return this.submit({ actor, project, stage, options });
  }

  /**
   * RF-128, RF-152: an upload or workbook project reads what it holds, so a run needs it; no run is created without it. The
   * confirmations of the request are judged first, so the owner is asked for each thing once.
   */
  private async submit(
    input: Parameters<SubmitRun['execute']>[0],
  ): Promise<Result<SubmittedRun, StartRunProblem>> {
    const { project } = input;
    if (project.sourceKind !== 'github' && project.upload === undefined) {
      return err(ERROR_CODES.projectNoSource);
    }
    // RF-431, EV-44: a role with no usable key would fail RST-2302 at $0; no run is queued.
    if (await anyRoleWithoutKey(this.deps.roleKeys, project, MODEL_ROLES_OF[input.stage] ?? [])) {
      return err(ERROR_CODES.providerKeyMissing);
    }
    return this.deps.submit.execute(input);
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
    // RF-132: an uploaded project also needs the second confirmation for the planner.
    // DEC-151: it is recorded, so the queue can check it again when the run starts.
    const needsPrivate = rolesNeedPrivateConfirmation(project, this.deps.ollamaHost, roles);
    if (needsPrivate && request.privateCodeConfirmed !== true) {
      return err(ERROR_CODES.privateCodeNotConfirmed);
    }
    const options = {
      ...{ cloudConsent, ...(needsPrivate ? { privateCodeConfirmed: true } : {}) },
      ...(sourceRunId === undefined ? {} : { sourceRunId }),
    };
    return this.submit({ actor, project, stage: 'plan', options });
  }

  /**
   * RF-208, Q-43, RF-1105: a retry names the run it retries, which must be the user's, of this
   * project and an understand run that ended `Completed`, and the areas to read again. Another
   * user's run or another project's answers like an unknown one.
   */
  private async retryProblem(
    request: StartRunRequest,
    project: Project,
  ): Promise<StartRunProblem | undefined> {
    if (request.retryOf === undefined) return undefined;
    const parent = await this.deps.runs.find(request.actor.userId, request.retryOf);
    if (parent?.projectId !== project.id) return ERROR_CODES.notFound;
    const retryable = parent.stage === 'understand' && parent.endState === 'Completed';
    return retryable && (request.areas?.length ?? 0) > 0 ? undefined : ERROR_CODES.requestInvalid;
  }

  // RF-143, RF-132, RF-200
  private async understand(
    request: StartRunRequest,
    project: Project,
  ): Promise<Result<SubmittedRun, StartRunProblem>> {
    const { ollamaHost } = this.deps;
    const retryProblem = await this.retryProblem(request, project);
    if (retryProblem !== undefined) return err(retryProblem);
    const needsPrivate = rolesNeedPrivateConfirmation(project, ollamaHost);
    const options = understandOptionsOf({
      ...request,
      privateCodeConfirmed: needsPrivate && request.privateCodeConfirmed === true,
    });
    if (!options.cloudConsent && rolesNeedCloudConsent(project.settings, ollamaHost)) {
      return err(ERROR_CODES.cloudConsentMissing);
    }
    // RF-132: the code of an upload is usually private; a second, separate confirmation is needed.
    if (needsPrivate && options.privateCodeConfirmed !== true) {
      return err(ERROR_CODES.privateCodeNotConfirmed);
    }
    const { actor } = request;
    return this.submit({
      actor,
      project,
      stage: 'understand',
      options: { ...options },
    });
  }
}
