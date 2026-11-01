import type { Actor } from '../../domain/accounts/actor.js';
import type { Amount } from '../../domain/budget/approved-amount.js';
import { continuedAmount } from '../runs/approved-journey.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { Clock } from '../ports/clock.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { RunQueue } from '../runs/run-queue.js';
import { scopeOf } from '../runs/run-scope.js';
import { readUnderstandOptions } from '../understand/understand-options.js';
import type { SubmittedRun } from './submit-run.js';

// RF-432, RF-006, RF-1105, ADR-026, DEC-196: Continue (+N) answers a run that paused near the
// amount its owner approved. The manifest's approved amount grows by N (the remainder offered by
// default) and the run waits in the queue like a resumed run: the same row, folder and manifest,
// only its unfinished tasks run again. Another user's run and an unknown id answer the same (404);
// a run that is not paused answers 409. Everything happens in one queue step, so two answers
// cannot both raise the amount and no dispatch starts the run from the old manifest.

export interface ContinueRunDependencies {
  readonly runs: RunIndex;
  readonly manifests: RunManifestStore;
  readonly queue: Pick<RunQueue, 'exclusive' | 'positionOf'>;
  readonly clock: Clock;
}

export type ContinueProblem = typeof ERROR_CODES.notFound | typeof ERROR_CODES.conflict;

export class ContinueRun {
  private readonly deps: ContinueRunDependencies;

  constructor(deps: ContinueRunDependencies) {
    this.deps = deps;
  }

  // RF-432, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
    /** N; the remainder of the approved journey when left out. */
    readonly extra?: Amount;
  }): Promise<Result<SubmittedRun, ContinueProblem>> {
    const { userId } = request.actor;
    const run = await this.deps.runs.find(userId, request.runId);
    if (run === undefined) return err(ERROR_CODES.notFound);
    const continued = await this.deps.queue.exclusive(run.id, () =>
      this.continueOnce(userId, run.id, request.extra),
    );
    if (!continued.ok || continued.value === undefined) return err(ERROR_CODES.conflict);
    const current = await this.deps.runs.find(userId, run.id);
    return ok({
      run: current ?? continued.value,
      position: await this.deps.queue.positionOf(run.id),
    });
  }

  /** Raises the amount, then queues the run; undefined when the run is not paused. */
  private async continueOnce(
    userId: string,
    runId: string,
    extra: Amount | undefined,
  ): Promise<Run | undefined> {
    const { runs, manifests, clock } = this.deps;
    const run = await runs.find(userId, runId);
    if (run?.queueState !== 'AwaitingApproval') return undefined;
    const scope = scopeOf(run);
    const stored = await manifests.read(scope);
    if (stored === undefined) return undefined;
    await manifests.write(scope, raisedManifest(stored, extra));
    const queued = await runs.continueAwaiting(userId, runId, clock.now().getTime());
    // The row did not move: the manifest goes back, so the amount is raised only with the run.
    if (queued === undefined) await manifests.write(scope, stored);
    return queued;
  }
}

/** RF-432: the manifest with the approved amount raised by N and the start cleared, as a resume. */
function raisedManifest(manifest: RunManifest, extra: Amount | undefined): RunManifest {
  const { approvedAmount } = readUnderstandOptions(manifest.options);
  const options =
    approvedAmount === undefined
      ? manifest.options
      : {
          ...manifest.options,
          // RF-432: N is at most the offered one; the sum stays within the ceilings.
          approvedAmount: continuedAmount(approvedAmount, extra),
        };
  return { ...manifest, startedAt: null, options };
}
