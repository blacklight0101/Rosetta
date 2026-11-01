import type { Actor } from '../../domain/accounts/actor.js';
import type { Project } from '../projects/project.js';
import { canDeepen } from '../../domain/deepen/deepen-record.js';
import { DEEPEN_ROUNDS, isAllowedRoundLimit } from '../../domain/deepen/stop-rule.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { scopeOf } from '../runs/run-scope.js';
import {
  readUnderstandOptions,
  rolesNeedCloudConsent,
  rolesNeedPrivateConfirmation,
  UNDERSTAND_ROLES,
  understandOptionsOf,
} from '../understand/understand-options.js';
import type { SubmitRun, SubmittedRun } from './submit-run.js';
import { anyRoleWithoutKey, type RoleKeyDependencies } from '../runs/role-keys.js';

// RF-209, RF-1105, RF-143, ADR-007, DEC-144, DEC-145: Start Deepen is what the owner's confirmation
// on the estimate calls (`POST /api/runs/:runId/deepen`). It never starts by itself: nothing but
// this request with `confirmed` creates a Deepen run. The run to deepen must be the user's own
// (another user's id answers like an unknown one) and an understand run that ended `Completed`
// (a Deepen run too, Q-L). The Deepen is a new understand run over the same areas, linked to that
// run in its options, with the round limit (1 to 5, default 3) and the coverage pass the owner
// confirmed; a reader that sends code off this machine needs the consent again (RF-143).

export interface StartDeepenDependencies {
  readonly projects: Pick<ProjectRepository, 'find'>;
  readonly runs: Pick<RunIndex, 'find'>;
  readonly manifests: Pick<RunManifestStore, 'read'>;
  readonly submit: Pick<SubmitRun, 'execute'>;
  /** The host of the server's Ollama (`ROSETTA_OLLAMA_URL`); an Ollama elsewhere needs consent (RF-143). */
  readonly ollamaHost?: string;
  /** RF-431: whether each role of the run has a usable key; checked before the run is queued. */
  readonly roleKeys: RoleKeyDependencies;
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
  | typeof ERROR_CODES.providerKeyMissing;

export class StartDeepen {
  private readonly deps: StartDeepenDependencies;

  constructor(deps: StartDeepenDependencies) {
    this.deps = deps;
  }

  // RF-209, RF-1105
  async execute(request: StartDeepenRequest): Promise<Result<SubmittedRun, StartDeepenProblem>> {
    const { actor } = request;
    const run = await this.deps.runs.find(actor.userId, request.runId);
    if (run === undefined) return err(ERROR_CODES.notFound);
    if (!canDeepen(run)) return err(ERROR_CODES.runNotDeepenable);
    if (!request.confirmed) return err(ERROR_CODES.deepenNotConfirmed);
    const maxRounds = request.maxRounds ?? DEEPEN_ROUNDS.default;
    if (!isAllowedRoundLimit(maxRounds)) return err(ERROR_CODES.requestInvalid);
    const project = await this.deps.projects.find(actor.userId, run.projectId);
    const stored = await this.deps.manifests.read(scopeOf(run));
    if (project === undefined || stored === undefined) return err(ERROR_CODES.notFound);
    const cloudConsent = request.cloudConsent === true;
    const refusal = await this.refusalOf(request, project);
    if (refusal !== undefined) return err(refusal);
    const privateCodeConfirmed = request.privateCodeConfirmed === true;
    const { areas } = readUnderstandOptions(stored.options);
    const deepen = { parentRunId: run.id, maxRounds, coveragePass: request.coveragePass !== false };
    const options = understandOptionsOf({
      ...{ areas, cloudConsent, deepen },
      privateCodeConfirmed:
        privateCodeConfirmed && rolesNeedPrivateConfirmation(project, this.deps.ollamaHost),
    });
    return this.deps.submit.execute({
      actor,
      project,
      stage: 'understand',
      options: { ...options },
    });
  }

  /**
   * RF-143: no consent for a cloud provider; RF-132: no second confirmation for an upload; RF-431: a
   * role with no usable key, refused before the Deepen is queued.
   */
  private async refusalOf(
    request: StartDeepenRequest,
    project: Project,
  ): Promise<StartDeepenProblem | undefined> {
    const { ollamaHost } = this.deps;
    if (request.cloudConsent !== true && rolesNeedCloudConsent(project.settings, ollamaHost)) {
      return ERROR_CODES.cloudConsentMissing;
    }
    const needsPrivate = rolesNeedPrivateConfirmation(project, ollamaHost);
    if (needsPrivate && request.privateCodeConfirmed !== true) {
      return ERROR_CODES.privateCodeNotConfirmed;
    }
    const keyMissing = await anyRoleWithoutKey(this.deps.roleKeys, project, UNDERSTAND_ROLES);
    return keyMissing ? ERROR_CODES.providerKeyMissing : undefined;
  }
}
