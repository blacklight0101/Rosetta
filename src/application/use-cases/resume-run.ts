import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { reopenManifest } from '../../domain/runs/reopen-manifest.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import { RESUMABLE_END_STATES, type Run } from '../../domain/runs/run.js';
import type { Clock } from '../ports/clock.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { capsOf } from '../runs/accepted-manifest.js';
import type { RunQueue } from '../runs/run-queue.js';
import { scopeOf } from '../runs/run-scope.js';
import { readUnderstandOptions, rolesNeedCloudConsent } from '../understand/understand-options.js';
import type { ResumeProblemCheck } from '../understand/resume-problem.js';
import type { SubmittedRun } from './submit-run.js';

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
  readonly queue: Pick<RunQueue, 'dispatch' | 'positionOf'>;
  readonly clock: Clock;
  /** What would make the resumed run fail again the same way; found before the run is reopened. */
  readonly problem: ResumeProblemCheck;
  /** The host of the server's Ollama (`ROSETTA_OLLAMA_URL`); an Ollama elsewhere needs consent (RF-143). */
  readonly ollamaHost?: string;
}

export type ResumeProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.runNotResumable
  | typeof ERROR_CODES.cloudConsentMissing;

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
    const { runs, projects, manifests, clock } = this.deps;
    const { userId } = request.actor;
    const run = await runs.find(userId, request.runId);
    if (run === undefined) return err(ERROR_CODES.notFound);
    if (!canResume(run)) return err(ERROR_CODES.runNotResumable);
    const project = await projects.find(userId, run.projectId);
    const stored = await manifests.read(scopeOf(run));
    if (project === undefined || stored === undefined) return err(ERROR_CODES.runNotResumable);
    const consent = readUnderstandOptions(stored.options).cloudConsent;
    if (!consent && rolesNeedCloudConsent(project.settings, this.deps.ollamaHost)) {
      return err(ERROR_CODES.cloudConsentMissing);
    }
    // The row changes first and in one step, so a second Resume finds the run queued and is refused.
    const reopened = await runs.reopen(userId, run.id, clock.now().getTime());
    if (reopened === undefined) return err(ERROR_CODES.runNotResumable);
    const caps = capsOf(project.settings);
    const reopenedManifest = reopenManifest(stored, caps);
    await this.write(reopened, reopenedManifest.ok ? reopenedManifest.value : { ...stored, caps });
    await this.deps.queue.dispatch();
    const current = await runs.find(userId, run.id);
    return ok({ run: current ?? reopened, position: await this.deps.queue.positionOf(run.id) });
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
