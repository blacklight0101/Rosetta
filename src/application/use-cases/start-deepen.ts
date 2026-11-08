import type { Actor } from '../../domain/accounts/actor.js';
import type { Project } from '../projects/project.js';
import { canDeepen } from '../../domain/deepen/deepen-record.js';
import { DEEPEN_ROUNDS, isAllowedRoundLimit } from '../../domain/deepen/stop-rule.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { withProjectLock } from '../journey/journey-lock.js';
import { stepAmountChecked } from '../journey/journey-budget.js';
import type { JourneyRecords } from '../ports/journey-records.js';
import { scopeOf } from '../runs/run-scope.js';
import {
  readUnderstandOptions,
  UNDERSTAND_ROLES,
  understandOptionsOf,
} from '../understand/understand-options.js';
import { consentNeedOf } from '../consent/consent-need.js';
import { settleConsent, type StartConsents } from '../consent/start-consent.js';
import type { SubmitRun, SubmittedRun } from './submit-run.js';
import { anyRoleWithoutKey, type RoleKeyDependencies } from '../runs/role-keys.js';

// RF-209, RF-1105, RF-143, ADR-007, DEC-144, DEC-145: Start Deepen is what the owner's confirmation
// on the estimate calls (`POST /api/runs/:runId/deepen`). It never starts by itself: nothing but
// this request with `confirmed` creates a Deepen run. The run to deepen must be the user's own
// (another user's id answers like an unknown one) and an understand run that ended `Completed`
// (a Deepen run too, Q-L). The Deepen is a new understand run over the same areas, linked to that
// run in its options, with the round limit (1 to 5, default 3) and the coverage pass the owner
// confirmed; a reader that sends code off this machine needs the consent again (RF-143), unless a
// consent of the project holds for it (DEC-209): then the Deepen runs under it and records its id.

export interface StartDeepenDependencies {
  readonly projects: Pick<ProjectRepository, 'find'>;
  readonly runs: Pick<RunIndex, 'find' | 'list'>;
  /** RF-435: a Deepen runs under what is left of the journey's approved amount. */
  readonly journeys?: JourneyRecords;
  readonly manifests: Pick<RunManifestStore, 'read'>;
  readonly submit: Pick<SubmitRun, 'execute'>;
  /** The host of the server's Ollama (`ROSETTA_OLLAMA_URL`); an Ollama elsewhere needs consent (RF-143). */
  readonly ollamaHost?: string;
  /** RF-431: whether each role of the run has a usable key; checked before the run is queued. */
  readonly roleKeys: RoleKeyDependencies;
  /** DEC-209: the consents of the project; absent, every Deepen needs the boxes. */
  readonly consents?: StartConsents;
}

export interface StartDeepenRequest {
  readonly actor: Actor;
  /** The completed understand run to deepen. */
  readonly runId: string;
  /** RF-209: the owner saw the estimate and confirmed it; nothing starts without it. */
  readonly confirmed: boolean;
  /** Q-H: 1 to 5; 3 when absent. */
  readonly maxRounds?: number | undefined;
  /** Q-J: ticked unless the owner unticked it. */
  readonly coveragePass?: boolean | undefined;
  readonly cloudConsent?: boolean | undefined;
  /** RF-132: the second confirmation, for an uploaded project whose roles use a cloud provider. */
  readonly privateCodeConfirmed?: boolean | undefined;
}

export type StartDeepenProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.runNotDeepenable
  | typeof ERROR_CODES.deepenNotConfirmed
  | typeof ERROR_CODES.requestInvalid
  | typeof ERROR_CODES.cloudConsentMissing
  | typeof ERROR_CODES.privateCodeNotConfirmed
  | typeof ERROR_CODES.runStageNotAvailable
  | typeof ERROR_CODES.providerKeyMissing
  | typeof ERROR_CODES.journeyAmountUsed;

/** RF-209: the rounds asked for, the default when none; undefined when the number is not allowed. */
function roundLimitOf(request: StartDeepenRequest): number | undefined {
  const maxRounds = request.maxRounds ?? DEEPEN_ROUNDS.default;
  return isAllowedRoundLimit(maxRounds) ? maxRounds : undefined;
}

export class StartDeepen {
  private readonly deps: StartDeepenDependencies;

  constructor(deps: StartDeepenDependencies) {
    this.deps = deps;
  }

  // RF-209, RF-1105
  async execute(request: StartDeepenRequest): Promise<Result<SubmittedRun, StartDeepenProblem>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    // P8-03: the free line of the journey is read and used by one start at a time.
    return withProjectLock(run?.projectId ?? request.runId, () => this.start(request));
  }

  private async start(
    request: StartDeepenRequest,
  ): Promise<Result<SubmittedRun, StartDeepenProblem>> {
    const { actor } = request;
    const run = await this.deps.runs.find(actor.userId, request.runId);
    if (run === undefined) return err(ERROR_CODES.notFound);
    if (!canDeepen(run)) return err(ERROR_CODES.runNotDeepenable);
    if (!request.confirmed) return err(ERROR_CODES.deepenNotConfirmed);
    const maxRounds = roundLimitOf(request);
    if (maxRounds === undefined) return err(ERROR_CODES.requestInvalid);
    const project = await this.deps.projects.find(actor.userId, run.projectId);
    const stored = await this.deps.manifests.read(scopeOf(run));
    if (project === undefined || stored === undefined) return err(ERROR_CODES.notFound);
    const consent = await this.consentOf(request, project);
    if (!consent.ok) return err(consent.error);
    // RF-431: a role with no usable key is refused before the Deepen is queued.
    if (await anyRoleWithoutKey(this.deps.roleKeys, project, UNDERSTAND_ROLES)) {
      return err(ERROR_CODES.providerKeyMissing);
    }
    const { areas } = readUnderstandOptions(stored.options);
    const deepen = { parentRunId: run.id, maxRounds, coveragePass: request.coveragePass !== false };
    // P8-03: nothing is left of the journey's amount; no run is queued.
    const line = await stepAmountChecked(this.deps, {
      userId: actor.userId,
      projectId: project.id,
    });
    if (!line.ok) return err(line.error);
    const approvedAmount = line.value;
    const options = understandOptionsOf({ areas, deepen, approvedAmount, ...consent.value });
    return this.deps.submit.execute({
      actor,
      project,
      stage: 'understand',
      options: { ...options },
      // RF-1108, DEC-226: the row keeps the run the Deepen improves from the start.
      facts: { deepenParentId: run.id },
    });
  }

  /**
   * RF-143: no consent for a cloud provider; RF-132: no second confirmation for an upload; either
   * stands when a consent of the project holds (DEC-209).
   */
  private consentOf(
    request: StartDeepenRequest,
    project: Project,
  ): ReturnType<typeof settleConsent> {
    return settleConsent(this.deps.consents, {
      ...{ actor: request.actor, projectId: project.id },
      need: consentNeedOf(project, this.deps.ollamaHost),
      cloudConsent: request.cloudConsent === true,
      privateCodeConfirmed: request.privateCodeConfirmed === true,
    });
  }
}
