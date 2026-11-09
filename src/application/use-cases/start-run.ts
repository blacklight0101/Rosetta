import { approvedJourneyOf, type JourneyLookup } from '../runs/approved-journey.js';
import { withProjectLock } from '../journey/journey-lock.js';
import { recordJourney, stepAmountChecked } from '../journey/journey-budget.js';
import type { JourneyRecords } from '../ports/journey-records.js';
import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunStage } from '../../domain/runs/run-states.js';
import type { AgentRole } from '../ports/llm-provider.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { planSourceRun } from '../plan/plan-source.js';
import type { Project } from '../projects/project.js';
import {
  type ApprovedAmount,
  UNDERSTAND_ROLES,
  understandOptionsOf,
} from '../understand/understand-options.js';
import { runStartConsent } from '../consent/run-start-consent.js';
import type { StartConsents } from '../consent/start-consent.js';
import type { SubmitRun, SubmittedRun } from './submit-run.js';
import { anyRoleWithoutKey, type RoleKeyDependencies } from '../runs/role-keys.js';

// RF-003, RF-1108, RF-1105, RF-143, RF-132, RF-200: Start run is what `POST /api/projects/:id/runs` calls.
// It finds the signed-in user's project (another user's id and an unknown id answer the same) and
// submits a run of a stage whose use case exists. Each stage card adds its stage to
// `STARTABLE_STAGES`. An understand run records its areas and the cloud consent; when its roles
// would send code off this machine and the request has no consent, it is refused (RST-1515)
// before any run exists, so nothing can be sent (RF-143). The same run on a project of kind `upload`
// also needs `privateCodeConfirmed: true` (RST-1521, RF-132); a GitHub project never does. A consent
// of the project that holds stands for both, and a start that carries them gives one (DEC-209).

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
  /** P7-38: a retry takes the cloud consent recorded in the manifest of the run it retries. */
  readonly manifests: Pick<RunManifestStore, 'read'>;
  /** RST-1801: a plan run needs the brief the owner saved. */
  readonly briefs: Pick<PlanningBriefStore, 'read'>;
  readonly submit: SubmitRun;
  /** The host of the server's Ollama (`ROSETTA_OLLAMA_URL`); an Ollama elsewhere needs consent (RF-143). */
  readonly ollamaHost?: string;
  /** RF-431: whether each role of the run has a usable key; checked before the run is queued. */
  readonly roleKeys: RoleKeyDependencies;
  /**
   * RF-430, RF-432: the server's journey estimate. A start that names the figure it showed records
   * the server's figures as the approved amount; the browser never sets it. Required: no wiring can
   * leave the check out.
   */
  readonly journey: JourneyLookup;
  /**
   * RF-011, RF-435, ADR-027: the project's journey. Pressing Analyse records it; a later step runs
   * under what is left of its amount. Absent only where no journey is kept (evaluation tools).
   */
  readonly journeys?: JourneyRecords;
  /**
   * DEC-209: the consents of the project. Absent only where none is kept (evaluation tools): every
   * start then needs the boxes.
   */
  readonly consents?: StartConsents;
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
  | typeof ERROR_CODES.requestInvalid
  | typeof ERROR_CODES.approvalChanged
  | typeof ERROR_CODES.journeyAmountUsed;

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
    const lock = <T>(step: () => Promise<T>) => withProjectLock(project.id, step);
    if (stage === 'understand') return lock(() => this.understand(request, project));
    if (stage === 'plan') return lock(() => this.plan(request, project));
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
    const owner = { userId: request.actor.userId, projectId: project.id };
    const brief = await this.deps.briefs.read(owner);
    if (brief === undefined) return err(ERROR_CODES.planBriefMissing);
    // RF-614, RST-1802, RF-1105: a named source run is checked before any run exists.
    const { actor, sourceRunId } = request;
    const named = await this.namedSourceOf(owner, sourceRunId);
    if (!named.ok) return err(named.error);
    // RF-132: an uploaded project also needs the second confirmation for the planner.
    // DEC-151: it is recorded, so the queue can check it again when the run starts.
    const consent = await runStartConsent(this.deps, request, project, ['planner']);
    if (!consent.ok) return err(consent.error);
    const planLine = await this.planLineOf(request, project);
    if (!planLine.ok) return err(planLine.error);
    const { privateCodeConfirmed, ...recorded } = consent.value;
    const options = {
      ...{ ...recorded, ...(privateCodeConfirmed ? { privateCodeConfirmed } : {}) },
      ...(sourceRunId === undefined ? {} : { sourceRunId }),
      ...planLine.value,
    };
    return this.submit({ actor, project, stage: 'plan', options, facts: named.value });
  }

  /** RF-614, RST-1802, RF-1108, DEC-226: what the row keeps of a named source, or why it cannot be used. */
  private async namedSourceOf(
    owner: { readonly userId: string; readonly projectId: string },
    sourceRunId: string | undefined,
  ): Promise<Result<Pick<Run, 'planSourceKey'>, StartRunProblem>> {
    if (sourceRunId === undefined) return ok({});
    const found = await planSourceRun(this.deps.runs, owner, sourceRunId);
    return found.ok ? ok({ planSourceKey: found.value.runKey }) : found;
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

  /** RF-432: the server's figures for the shown one; none when the start showed none. */
  private async approvedOf(
    request: StartRunRequest,
  ): Promise<Result<ApprovedAmount | undefined, typeof ERROR_CODES.approvalChanged>> {
    const shown = request.approvedAmount;
    if (shown === undefined) return ok(undefined);
    const { actor, projectId, areas } = request;
    return approvedJourneyOf(shown, await this.deps.journey({ actor, projectId, areas }));
  }

  // RF-143, RF-132, RF-200
  private async understand(
    request: StartRunRequest,
    project: Project,
  ): Promise<Result<SubmittedRun, StartRunProblem>> {
    const retryProblem = await this.retryProblem(request, project);
    if (retryProblem !== undefined) return err(retryProblem);
    const approved = await this.approvedOf(request);
    if (!approved.ok) return err(approved.error);
    const line = await this.leftOf(request, project, approved.value);
    if (!line.ok) return err(line.error);
    // RF-132: the code of an upload is usually private; a second, separate confirmation is needed.
    const consent = await runStartConsent(this.deps, request, project, UNDERSTAND_ROLES);
    if (!consent.ok) return err(consent.error);
    const options = understandOptionsOf({
      ...request,
      ...consent.value,
      approvedAmount: line.value,
    });
    const { actor } = request;
    const submitted = await this.submit({
      actor,
      project,
      stage: 'understand',
      options: { ...options },
    });
    const owner = { userId: actor.userId, projectId: project.id };
    if (submitted.ok) {
      await recordJourney(this.deps.journeys, owner, approved.value, submitted.value.run.queuedAt);
    }
    return submitted;
  }

  /**
   * RF-435, RF-432, P8-01: a plan of a journey runs under what is left of its approved amount and
   * pauses there; a project with no journey records none and keeps its run caps as a hard stop.
   */
  private async planLineOf(
    request: StartRunRequest,
    project: Project,
  ): Promise<
    Result<{ readonly approvedAmount?: ApprovedAmount }, typeof ERROR_CODES.journeyAmountUsed>
  > {
    const left = await this.leftOf(request, project);
    if (!left.ok) return left;
    return ok(left.value === undefined ? {} : { approvedAmount: { ...left.value } });
  }

  /** RF-435: a step with no figure of its own runs under what is left of the journey's amount. */
  private async leftOf(
    request: StartRunRequest,
    project: Project,
    shown?: ApprovedAmount,
  ): Promise<Result<ApprovedAmount | undefined, typeof ERROR_CODES.journeyAmountUsed>> {
    if (shown !== undefined) return ok(shown);
    const owner = { userId: request.actor.userId, projectId: project.id };
    const { journeys, runs, manifests } = this.deps;
    return stepAmountChecked({ journeys, runs, manifests }, owner);
  }
}
