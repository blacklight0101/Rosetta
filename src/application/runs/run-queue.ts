import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { queuePositions, runsToStart } from '../../domain/runs/queue-rules.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunStage } from '../../domain/runs/run-states.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { RunExecution, RunExecutor, RunOutcome } from '../ports/run-executor.js';
import type { RunIndex } from '../ports/run-index.js';
import { KeyedQueue } from '../support/keyed-queue.js';
import type { RunLifecycle, StartedRun } from './run-lifecycle.js';

// RF-1108, RF-003, RNF-002, DEC-61, DEC-112: the run queue of this server process (one instance
// assumed). Queued runs start in queue order while fewer than `maxRunning` run and their user has
// none running; a run that ends frees its slot and the next one starts by itself. Everything that
// changes who runs (starting, stopping, recovery) happens one step at a time, so a run cannot be
// stopped half-way through starting. The run itself is not awaited: the executor of its stage runs
// in the background with an abort signal, and its outcome is recorded when it returns.

/** The default of at most this many running runs on the server (RF-1108). */
export const DEFAULT_MAX_RUNNING_RUNS = 2;

export interface RunQueueDependencies {
  readonly runs: RunIndex;
  readonly lifecycle: RunLifecycle;
  /** The executor of each stage; a run of a stage without one waits in the queue. */
  readonly executors: Partial<Record<RunStage, RunExecutor>>;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly maxRunning: number;
}

export interface StopOutcome {
  /** `stopping`: the signal of a running run was aborted; `cancelled`: a queued run ended. */
  readonly kind: 'stopping' | 'cancelled';
  readonly run: Run;
}

export type StopProblem = 'not-found' | 'already-ended';

const STEP = 'queue';

function failureOf(error: unknown): RunOutcome {
  const errorCode = error instanceof RosettaError ? error.code : ERROR_CODES.unexpected;
  return { endState: 'Failed', errorCode };
}

export class RunQueue {
  private readonly deps: RunQueueDependencies;
  private readonly steps = new KeyedQueue();
  private readonly controllers = new Map<string, AbortController>();
  private readonly inFlight = new Set<Promise<void>>();
  private closing = false;

  constructor(deps: RunQueueDependencies) {
    this.deps = deps;
  }

  /** Starts the queued runs that may start now. */
  // RF-1108
  dispatch(): Promise<void> {
    return this.steps.run(STEP, () => this.startWaiting());
  }

  /** Whether an executor is registered for the stage, so a run of it can start. */
  canRun(stage: RunStage): boolean {
    return this.deps.executors[stage] !== undefined;
  }

  /** The position of a queued run, counted from 1; undefined when it is not queued. */
  // RF-1108
  async positionOf(runId: string): Promise<number | undefined> {
    return queuePositions(await this.deps.runs.listQueued()).get(runId);
  }

  /** Aborts a running run of the user, or cancels a queued one as `Interrupted`. */
  // RF-1108, RF-1105, RNF-002
  stop(userId: string, runId: string): Promise<Result<StopOutcome, StopProblem>> {
    return this.steps.run(STEP, async () => {
      const run = await this.deps.runs.find(userId, runId);
      if (run === undefined) return err('not-found');
      if (run.queueState === 'Ended') return err('already-ended');
      const controller = this.controllers.get(run.id);
      if (run.queueState === 'Running' && controller !== undefined) {
        controller.abort();
        return ok({ kind: 'stopping', run });
      }
      const ended = await this.deps.lifecycle.finish(run, 'Interrupted');
      return ok({ kind: 'cancelled', run: ended ?? run });
    });
  }

  /**
   * Ends the runs left `Running` by an earlier process as `Interrupted` (a run this process is
   * running is left alone), then starts what can start. Queued runs keep their order.
   */
  // RF-1108, RNF-002
  recover(): Promise<void> {
    return this.steps.run(STEP, async () => {
      for (const run of await this.deps.runs.listRunning()) {
        if (!this.controllers.has(run.id)) await this.deps.lifecycle.finish(run, 'Interrupted');
      }
      await this.startWaiting();
    });
  }

  /** Stops every running run, waits for them to end and starts no other run. */
  // RNF-002
  async shutDown(): Promise<void> {
    this.closing = true;
    for (const controller of this.controllers.values()) controller.abort();
    await Promise.allSettled([...this.inFlight]);
  }

  private async startWaiting(): Promise<void> {
    if (this.closing) return;
    const { runs, maxRunning } = this.deps;
    const [queued, running] = await Promise.all([runs.listQueued(), runs.listRunning()]);
    const startable = queued.flatMap((run) => {
      const executor = this.deps.executors[run.stage];
      return executor === undefined ? [] : [{ run, executor }];
    });
    const chosen = new Set(
      runsToStart(
        startable.map((item) => item.run),
        running,
        maxRunning,
      ),
    );
    for (const { run, executor } of startable) {
      if (chosen.has(run)) await this.launch(run, executor);
    }
  }

  private async launch(run: Run, executor: RunExecutor): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(run.id, controller);
    let started: StartedRun | undefined;
    try {
      started = await this.deps.lifecycle.begin(run);
    } catch (error) {
      await this.report(run, 'could not start', error);
      await this.endQuietly(run, failureOf(error));
    }
    if (started === undefined) {
      this.controllers.delete(run.id);
      return;
    }
    const finished = this.execute(started, executor, controller).finally(() => {
      this.inFlight.delete(finished);
    });
    this.inFlight.add(finished);
  }

  private async execute(
    started: StartedRun,
    executor: RunExecutor,
    controller: AbortController,
  ): Promise<void> {
    const { run } = started;
    await this.endQuietly(run, await this.outcomeOf(started, executor, controller.signal));
    this.controllers.delete(run.id);
    await this.dispatch().catch((error: unknown) =>
      this.report(run, 'could not start the next run', error),
    );
  }

  /** Records the end of a run; a failure is logged, because the run row is the record that counts. */
  private async endQuietly(run: Run, outcome: RunOutcome): Promise<void> {
    try {
      await this.deps.lifecycle.finish(run, outcome.endState, outcome.errorCode);
    } catch (error) {
      await this.report(run, 'could not end', error);
    }
  }

  private async outcomeOf(
    started: StartedRun,
    executor: RunExecutor,
    signal: AbortSignal,
  ): Promise<RunOutcome> {
    const { run } = started;
    const execution: RunExecution = {
      run,
      manifest: started.manifest,
      events: started.events,
      signal,
      recordSource: (source) => this.deps.lifecycle.recordSource(run, source),
    };
    let outcome: RunOutcome;
    try {
      outcome = await executor.execute(execution);
    } catch (error) {
      await this.report(run, 'failed', error);
      outcome = failureOf(error);
    }
    // A stop is not a failure: the executor's abort error must not turn it into `Failed`.
    return signal.aborted && outcome.endState === 'Failed' ? { endState: 'Interrupted' } : outcome;
  }

  private async report(run: Run, what: string, error: unknown): Promise<void> {
    const code: ErrorCode | undefined = error instanceof RosettaError ? error.code : undefined;
    const detail = error instanceof Error ? error.message : String(error);
    await this.deps.logger.log({
      level: 'error',
      logger: 'runs',
      message: `Run ${run.runKey} ${what}: ${detail}`,
      runId: run.runKey,
      ...(code === undefined ? {} : { code }),
    });
  }
}
