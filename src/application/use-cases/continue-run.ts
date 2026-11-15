import type { Actor } from '../../domain/accounts/actor.js';
import { raiseApprovedAmount, type Amount } from '../../domain/budget/approved-amount.js';
import { withinCeilings } from '../runs/approved-journey.js';
import { withProjectLock } from '../journey/journey-lock.js';
import { journeyRaiseOf, offeredExtra, type JourneyRaise } from '../journey/journey-raise.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { Clock } from '../ports/clock.js';
import type { JourneyRecords } from '../ports/journey-records.js';
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
// RF-435, P9-01, EV-100: a run that is a step of a journey raises the journey's approved amount by
// the same N in that step, under the project's journey lock, so a start cannot read the journey
// between the two raises; when the run cannot be queued, the manifest and the journey go back.
// DEC-206: a Continue the journey can take none of adds nothing, so it is refused (RST-2311); a run
// queued before the current journey keeps its queue time, so it stays out of that journey.

export interface ContinueRunDependencies {
  readonly runs: RunIndex;
  readonly manifests: RunManifestStore;
  readonly queue: Pick<RunQueue, 'exclusive' | 'positionOf'>;
  readonly clock: Clock;
  /** RF-435: the journey records; none (the evaluation tools' wiring) raises only the run. */
  readonly journeys?: JourneyRecords | undefined;
}

export type ContinueProblem =
  typeof ERROR_CODES.notFound | typeof ERROR_CODES.conflict | typeof ERROR_CODES.journeyAmountUsed;

/** P9-14: the N a Continue gave the run next to the N that was offered; they differ when the room shrank. */
export interface ContinuedRun extends SubmittedRun {
  readonly offered: Amount;
  readonly granted: Amount;
}

/** What one Continue did: the queued run, a refusal, or nothing (the run is not paused). */
type Continued =
  | { readonly run: Run; readonly offered: Amount; readonly granted: Amount }
  | typeof ERROR_CODES.journeyAmountUsed
  | undefined;

/** The manifest raised by N and the raise of the journey that goes with it. */
interface Raise {
  readonly manifest: RunManifest;
  readonly journey: Omit<JourneyRaise, 'extra'>;
  readonly offered: Amount;
  readonly granted: Amount;
}

const nothing: Amount = { tokens: 0, costMicros: 0 };

const unchanged = (): Promise<void> => Promise.resolve();
const runAlone = { takesNothing: false, keepsQueuedAt: false, apply: unchanged, undo: unchanged };

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
  }): Promise<Result<ContinuedRun, ContinueProblem>> {
    const { userId } = request.actor;
    const run = await this.deps.runs.find(userId, request.runId);
    if (run === undefined) return err(ERROR_CODES.notFound);
    // RF-435: the journey's line is read and changed one step at a time for each project.
    const continued = await withProjectLock(run.projectId, () =>
      this.deps.queue.exclusive(run.id, () => this.continueOnce(userId, run.id, request.extra)),
    );
    if (!continued.ok || continued.value === undefined) return err(ERROR_CODES.conflict);
    if (typeof continued.value === 'string') return err(continued.value);
    const current = await this.deps.runs.find(userId, run.id);
    const { offered, granted } = continued.value;
    return ok({
      run: current ?? continued.value.run,
      offered,
      granted,
      position: await this.deps.queue.positionOf(run.id),
    });
  }

  /** Raises the amounts, then queues the run; undefined when the run is not paused. */
  private async continueOnce(
    userId: string,
    runId: string,
    extra: Amount | undefined,
  ): Promise<Continued> {
    const { runs, manifests, clock } = this.deps;
    const run = await runs.find(userId, runId);
    if (run?.queueState !== 'AwaitingApproval') return undefined;
    const scope = scopeOf(run);
    const stored = await manifests.read(scope);
    if (stored === undefined) return undefined;
    const raise = await this.raiseOf(run, stored, extra);
    if (raise.journey.takesNothing) return ERROR_CODES.journeyAmountUsed;
    await raise.journey.apply();
    const putBack = async (): Promise<void> => {
      await manifests.write(scope, stored);
      await raise.journey.undo();
    };
    let queued: Run | undefined;
    try {
      await manifests.write(scope, raise.manifest);
      const at = raise.journey.keepsQueuedAt ? run.queuedAt : clock.now().getTime();
      queued = await runs.continueAwaiting(userId, runId, at);
    } catch (error) {
      await putBack();
      throw error;
    }
    // The row did not move: the manifest and the journey go back, so neither is raised alone.
    if (queued === undefined) {
      await putBack();
      return undefined;
    }
    return { run: queued, offered: raise.offered, granted: raise.granted };
  }

  /** RF-432, RF-435: the manifest with its approved amount raised by N, and the journey's raise. */
  private async raiseOf(
    run: Run,
    manifest: RunManifest,
    extra: Amount | undefined,
  ): Promise<Raise> {
    const { approvedAmount } = readUnderstandOptions(manifest.options);
    if (approvedAmount === undefined) {
      return { manifest, journey: runAlone, offered: nothing, granted: nothing };
    }
    // RF-432: N is at most the offered one; the sum stays within the ceilings.
    const offered = offeredExtra(approvedAmount, extra);
    const journey = await journeyRaiseOf(this.deps.journeys, run, offered);
    // P9-01: the run takes the N its journey took, so neither passes the other or the ceilings.
    const raised = withinCeilings(raiseApprovedAmount(approvedAmount, journey.extra));
    return {
      manifest: { ...manifest, options: { ...manifest.options, approvedAmount: raised } },
      journey,
      offered,
      granted: journey.extra,
    };
  }
}
