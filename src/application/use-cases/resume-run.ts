import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { reopenManifest } from '../../domain/runs/reopen-manifest.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import { RESUMABLE_END_STATES, type Run } from '../../domain/runs/run.js';
import type { Clock } from '../ports/clock.js';
import type { Project } from '../projects/project.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { capsOf } from '../runs/accepted-manifest.js';
import type { RunQueue } from '../runs/run-queue.js';
import { scopeOf } from '../runs/run-scope.js';
import {
  readUnderstandOptions,
  rolesNeedCloudConsent,
  UNDERSTAND_ROLES,
  rolesNeedPrivateConfirmation,
} from '../understand/understand-options.js';
import type { ResumeProblemCheck } from '../understand/resume-problem.js';
import type { SubmittedRun } from './submit-run.js';
import { anyRoleWithoutKey, type RoleKeyDependencies } from '../runs/role-keys.js';

// RF-006, RF-1105, RF-143, ADR-007, DEC-13, RNF-002: Resume run queues the user's ended understand
// run again. It is the same run: the same row, folder and manifest. The manifest forgets the end
// and takes the caps the project has now (the owner raises a cap before pressing Resume), and the
// run starts when the queue has room, like a new one. Another user's run and an unknown id answer
// the same; only an understand run that ended at a cap, failed or was interrupted can be resumed,
// and once at a time. A reader that would send code off this machine needs the run's consent (RF-143).

export interface ResumeRunDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly manifests: RunManifestStore;
  readonly queue: Pick<RunQueue, 'exclusive' | 'positionOf'>;
  readonly clock: Clock;
  /** What would make the resumed run fail again the same way; found before the run is reopened. */
  readonly problem: ResumeProblemCheck;
  /** The host of the server's Ollama (`ROSETTA_OLLAMA_URL`); an Ollama elsewhere needs consent (RF-143). */
  readonly ollamaHost?: string;
  /** RF-431: whether each role of the run has a usable key; checked before the run is queued. */
  readonly roleKeys: RoleKeyDependencies;
}

export type ResumeProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.runNotResumable
  | typeof ERROR_CODES.cloudConsentMissing
  | typeof ERROR_CODES.privateCodeNotConfirmed
  | typeof ERROR_CODES.resumeSourceChanged
  | typeof ERROR_CODES.taskResultsUnreadable
  | typeof ERROR_CODES.providerKeyMissing;

export class ResumeRun {
  private readonly deps: ResumeRunDependencies;

  constructor(deps: ResumeRunDependencies) {
    this.deps = deps;
  }

  // RF-006, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<SubmittedRun, ResumeProblem>> {
    const { runs, projects, manifests } = this.deps;
    const { userId } = request.actor;
    const run = await runs.find(userId, request.runId);
    if (run === undefined) return err(ERROR_CODES.notFound);
    if (!canResume(run)) return err(ERROR_CODES.runNotResumable);
    const project = await projects.find(userId, run.projectId);
    const stored = await manifests.read(scopeOf(run));
    if (project === undefined || stored === undefined) return err(ERROR_CODES.runNotResumable);
    const refused = await this.refusal(run, project, stored);
    if (refused !== undefined) return err(refused);
    // One queue step: no dispatch can start the run from the old manifest, and the run is not
    // taken while this process is still writing its end. A second Resume finds the run queued.
    const reopened = await this.deps.queue.exclusive(run.id, () =>
      this.reopen(userId, run, project, stored),
    );
    if (!reopened.ok || reopened.value === undefined) return err(ERROR_CODES.runNotResumable);
    const current = await runs.find(userId, run.id);
    return ok({
      run: current ?? reopened.value,
      position: await this.deps.queue.positionOf(run.id),
    });
  }

  /** RF-143: no consent for a cloud reader; RF-006: a resume that would fail again. */
  private async refusal(
    run: Run,
    project: Project,
    stored: RunManifest,
  ): Promise<ResumeProblem | undefined> {
    const { cloudConsent, privateCodeConfirmed } = readUnderstandOptions(stored.options);
    const { ollamaHost } = this.deps;
    if (!cloudConsent && rolesNeedCloudConsent(project.settings, ollamaHost)) {
      return ERROR_CODES.cloudConsentMissing;
    }
    // RF-132: the run of an uploaded project resumes only if it was started with the confirmation.
    if (privateCodeConfirmed !== true && rolesNeedPrivateConfirmation(project, ollamaHost)) {
      return ERROR_CODES.privateCodeNotConfirmed;
    }
    // RF-431: a resume whose roles have no usable key would fail again at $0.
    if (await anyRoleWithoutKey(this.deps.roleKeys, project, UNDERSTAND_ROLES)) {
      return ERROR_CODES.providerKeyMissing;
    }
    return this.deps.problem(run, stored);
  }

  private async reopen(
    userId: string,
    run: Run,
    project: Project,
    stored: RunManifest,
  ): Promise<Run | undefined> {
    const reopened = await this.deps.runs.reopen(userId, run.id, this.deps.clock.now().getTime());
    if (reopened === undefined) return undefined;
    const caps = capsOf(project.settings);
    const next = reopenManifest(stored, caps);
    await this.write(reopened, next.ok ? next.value : { ...stored, caps });
    return reopened;
  }

  /** A manifest that cannot be rewritten leaves the run ended again, and the failure is rethrown. */
  private async write(run: Run, manifest: RunManifest): Promise<void> {
    try {
      await this.deps.manifests.write(scopeOf(run), manifest);
    } catch (error) {
      await this.deps.runs.end(run.id, 'Interrupted', this.deps.clock.now().getTime());
      throw error;
    }
  }
}

/** RF-006: only an understand run that stopped at a cap, failed or was interrupted has work left. */
function canResume(run: Run): boolean {
  const { endState } = run;
  return run.stage === 'understand' && endState !== null && RESUMABLE_END_STATES.includes(endState);
}
