import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import { RunLifecycle } from '../application/runs/run-lifecycle.js';
import { DEFAULT_MAX_RUNNING_RUNS, RunQueue } from '../application/runs/run-queue.js';
import { StopRun } from '../application/use-cases/stop-run.js';
import { SubmitRun } from '../application/use-cases/submit-run.js';
import { SubscribeRunEvents } from '../application/use-cases/subscribe-run-events.js';
import { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { FanOutSink } from '../infrastructure/events/fan-out-sink.js';
import { JsonlEventLog } from '../infrastructure/events/jsonl-event-log.js';
import { SseBroadcaster } from '../infrastructure/events/sse-broadcaster.js';
import { FileRunManifestStore } from '../infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { IntervalScheduler } from '../infrastructure/system/interval-scheduler.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import { StreamRegistry } from './web/event-stream.js';
import type { RunServices } from './web/run-routes.js';

// Architecture section 2 (composition root), RF-1006, RF-1108, RF-003: the run index, the event
// log with the live broadcaster, the manifest store, the run queue and the use cases behind the run
// routes. The executors of the stages are registered here as their cards land (the scan run of
// P1-23 first); until then a queued run of a stage without one stays queued, SubmitRun refuses
// such a stage with RST-2305 (409), and no route accepts a run yet.

export interface RunParts {
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly masker: TextMasker;
  /** `ROSETTA_DATA_DIR`. */
  readonly dataDir: string;
  /** The Rosetta version recorded in every manifest. */
  readonly version: string;
}

export interface RunComposition {
  readonly services: RunServices;
  /** Starts queued runs, stops runs, recovers after a restart. */
  readonly queue: RunQueue;
  /** Accepts a run into the queue; the stage routes call it. */
  readonly submitRun: SubmitRun;
}

// RF-1006, RF-1108
export function composeRuns(parts: RunParts): RunComposition {
  const { pool, logger, clock, masker, dataDir, version } = parts;
  const runs = new PgRunIndex(pool);
  const writer = new NodeOutputWriter({ dataDir, logger });
  const log = new JsonlEventLog({ writer, masker });
  const broadcaster = new SseBroadcaster(masker);
  const manifests = new FileRunManifestStore({ writer, masker });
  const lifecycle = new RunLifecycle({
    runs,
    manifests,
    sink: new FanOutSink([log, broadcaster]),
    history: log,
    clock,
    logger,
  });
  const queue = new RunQueue({
    runs,
    lifecycle,
    executors: {},
    clock,
    logger,
    maxRunning: DEFAULT_MAX_RUNNING_RUNS,
  });
  const heartbeat = new IntervalScheduler((error) => {
    void logger.log({
      level: 'warn',
      logger: 'runs',
      message: `Keep-alive failed: ${String(error)}`,
    });
  });
  return {
    queue,
    services: {
      subscribeRunEvents: new SubscribeRunEvents({ runs, history: log, feed: broadcaster }),
      stopRun: new StopRun({ queue }),
      heartbeat,
      streams: new StreamRegistry(),
    },
    submitRun: new SubmitRun({
      runs,
      manifests,
      queue,
      ids: new TimestampIdGenerator(clock),
      clock,
      rosettaVersion: version,
    }),
  };
}
