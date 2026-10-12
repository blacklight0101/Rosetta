import { vi } from 'vitest';
import type {
  RunExecution,
  RunExecutor,
  RunOutcome,
} from '../../src/application/ports/run-executor.js';
import type { RunScope } from '../../src/application/ports/run-events.js';
import { RunLifecycle } from '../../src/application/runs/run-lifecycle.js';
import { RunQueue } from '../../src/application/runs/run-queue.js';
import { SubmitRun } from '../../src/application/use-cases/submit-run.js';
import { StopRun } from '../../src/application/use-cases/stop-run.js';
import { SubscribeRunEvents } from '../../src/application/use-cases/subscribe-run-events.js';
import type { Actor } from '../../src/domain/accounts/actor.js';
import type { Run } from '../../src/domain/runs/run.js';
import type { RunStage } from '../../src/domain/runs/run-states.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { MemoryEventSink } from '../../src/infrastructure/events/memory-event-sink.js';
import { SseBroadcaster } from '../../src/infrastructure/events/sse-broadcaster.js';
import { FanOutSink } from '../../src/infrastructure/events/fan-out-sink.js';
import { MemoryRunManifestStore } from '../../src/infrastructure/files/memory-run-manifest-store.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { sampleProject } from './project-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-1108, RF-003, RF-1006: the run queue over memory adapters and an executor the test controls.

export const userAmy: Actor = { userId: '00000000-0000-4000-9000-0000000000a1', role: 'user' };
export const userBob: Actor = { userId: '00000000-0000-4000-9000-0000000000b2', role: 'user' };

interface Pending {
  readonly execution: RunExecution;
  readonly settle: (outcome: RunOutcome) => void;
  readonly fail: (error: unknown) => void;
}

/** An executor whose runs end when the test says so. */
export class ControlledExecutor implements RunExecutor {
  readonly started: RunExecution[] = [];
  private readonly pending = new Map<string, Pending>();

  execute(execution: RunExecution): Promise<RunOutcome> {
    this.started.push(execution);
    return new Promise((resolve, reject) => {
      this.pending.set(execution.run.id, {
        execution,
        settle: resolve,
        fail: reject,
      });
    });
  }

  /** The run keys that have started, in order. */
  get startedKeys(): string[] {
    return this.started.map((execution) => execution.run.runKey);
  }

  settle(runId: string, outcome: RunOutcome): void {
    this.pending.get(runId)?.settle(outcome);
  }

  fail(runId: string, error: unknown): void {
    this.pending.get(runId)?.fail(error);
  }

  signalOf(runId: string): AbortSignal | undefined {
    return this.pending.get(runId)?.execution.signal;
  }
}

export interface RunHarness {
  readonly queue: RunQueue;
  /** A new queue over the same stores and executor, as after a restart of the server. */
  restart(): RunQueue;
  readonly submit: SubmitRun;
  readonly stop: StopRun;
  readonly subscribe: SubscribeRunEvents;
  readonly runs: MemoryRunIndex;
  readonly manifests: MemoryRunManifestStore;
  readonly events: MemoryEventSink;
  readonly broadcaster: SseBroadcaster;
  readonly executor: ControlledExecutor;
  readonly clock: FixedClock;
  readonly logger: MemoryLogger;
  /** Submits a run of the user for a fresh project; returns it. */
  start(actor: Actor, stage?: RunStage): Promise<Run>;
  /** The scope the events and manifest of the run are stored under. */
  scopeOf(run: Run): RunScope;
  /** Waits until the run has ended. */
  ended(run: Run): Promise<Run>;
}

export interface RunHarnessOptions {
  readonly maxRunning?: number;
  /** The stages that have an executor; all five by default. */
  readonly stages?: readonly RunStage[];
}

const allStages: readonly RunStage[] = ['scan', 'understand', 'verify', 'report', 'plan'];

// RF-1108
export function createRunHarness(options: RunHarnessOptions = {}): RunHarness {
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const runs = new MemoryRunIndex();
  const manifests = new MemoryRunManifestStore();
  const events = new MemoryEventSink();
  const broadcaster = new SseBroadcaster(masker);
  const sink = new FanOutSink([events, broadcaster]);
  const executor = new ControlledExecutor();
  const executors = Object.fromEntries(
    (options.stages ?? allStages).map((stage) => [stage, executor]),
  );
  const lifecycle = new RunLifecycle({ runs, manifests, sink, history: events, clock, logger });
  const makeQueue = (): RunQueue =>
    new RunQueue({
      runs,
      lifecycle,
      executors,
      clock,
      logger,
      maxRunning: options.maxRunning ?? 2,
    });
  const queue = makeQueue();
  const ids = new SequenceIdGenerator();
  const submit = new SubmitRun({
    runs,
    manifests,
    queue,
    ids,
    clock,
    rosettaVersion: '1.2.3-test',
  });
  const stop = new StopRun({ queue });
  const subscribe = new SubscribeRunEvents({ runs, history: events, feed: broadcaster });
  const scopeOf = (run: Run): RunScope => ({
    id: run.id,
    userId: run.userId,
    projectId: run.projectId,
    runKey: run.runKey,
  });
  return {
    queue,
    restart: makeQueue,
    submit,
    stop,
    subscribe,
    runs,
    manifests,
    events,
    broadcaster,
    executor,
    clock,
    logger,
    scopeOf,
    async start(actor, stage = 'scan') {
      const project = sampleProject({ userId: actor.userId });
      const submitted = await submit.execute({ actor, project, stage, options: {} });
      if (!submitted.ok) throw new Error('The run was not accepted');
      return submitted.value.run;
    },
    async ended(run) {
      let latest: Run | undefined;
      await vi.waitFor(async () => {
        latest = await runs.find(run.userId, run.id);
        if (latest?.queueState !== 'Ended') throw new Error('The run has not ended');
      });
      if (latest === undefined) throw new Error('The run vanished');
      return latest;
    },
  };
}
