import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import { RunLifecycle } from '../application/runs/run-lifecycle.js';
import { DEFAULT_MAX_RUNNING_RUNS, RunQueue } from '../application/runs/run-queue.js';
import { RunScan } from '../application/use-cases/run-scan.js';
import { StartRun } from '../application/use-cases/start-run.js';
import { StopRun } from '../application/use-cases/stop-run.js';
import { SubmitRun } from '../application/use-cases/submit-run.js';
import { SubscribeRunEvents } from '../application/use-cases/subscribe-run-events.js';
import { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { FanOutSink } from '../infrastructure/events/fan-out-sink.js';
import { JsonlEventLog } from '../infrastructure/events/jsonl-event-log.js';
import { SseBroadcaster } from '../infrastructure/events/sse-broadcaster.js';
import { FileRunManifestStore } from '../infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import { GitHubSnapshotFetcher } from '../infrastructure/github/github-snapshot-fetcher.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import type { LanguagePackRegistry } from '../infrastructure/scan/packs/pack-registry.js';
import { SnapshotScanPipeline } from '../infrastructure/scan/scan-pipeline.js';
import { IntervalScheduler } from '../infrastructure/system/interval-scheduler.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import { StreamRegistry } from './web/event-stream.js';
import type { RunServices } from './web/run-routes.js';

// Architecture section 2 (composition root), RF-1006, RF-1108, RF-003: the run index, the event
// log with the live broadcaster, the manifest store, the run queue and the use cases behind the run
// routes. The executors of the stages are registered here as their cards land (the scan run of
// P1-23 first); SubmitRun refuses a stage without one with RST-2305 (409), and `POST
// /api/projects/:id/runs` starts the stages that have one (RF-003, RF-121, RF-126).

export interface RunParts {
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly masker: TextMasker;
  /** `ROSETTA_DATA_DIR`. */
  readonly dataDir: string;
  /** The Rosetta version recorded in every manifest. */
  readonly version: string;
  /** The optional read-only `GITHUB_TOKEN` (RF-123). */
  readonly githubToken: string | undefined;
  /** The language packs of this release (RF-110). */
  readonly packs: LanguagePackRegistry;
}

export interface RunComposition {
  readonly services: RunServices;
  /** Starts queued runs, stops runs, recovers after a restart. */
  readonly queue: RunQueue;
  /** Accepts a run into the queue; the stage routes call it. */
  readonly submitRun: SubmitRun;
  /**
   * Start-up: deletes the partial snapshot folders an interrupted download left (RF-122), then ends
   * the runs the earlier process left running and starts what can start (RF-1108).
   */
  recover(): Promise<void>;
}

interface ScanParts {
  readonly executor: RunScan;
  readonly fetcher: GitHubSnapshotFetcher;
}

/** The scan stage: the snapshot fetcher and the executor that fetches, scans and records. */
function composeScan(
  parts: RunParts,
  stores: { readonly writer: NodeOutputWriter; readonly manifests: FileRunManifestStore },
  projects: PgProjectRepository,
): ScanParts {
  const { logger, clock, masker, dataDir } = parts;
  const fetcher = new GitHubSnapshotFetcher({
    ...{ dataDir, clock, logger, idGenerator: new TimestampIdGenerator(clock) },
    githubToken: parts.githubToken,
  });
  const pipeline = new SnapshotScanPipeline({
    ...{ writer: stores.writer, masker, logger, packs: parts.packs },
  });
  const { manifests } = stores;
  return { fetcher, executor: new RunScan({ fetcher, projects, pipeline, manifests, clock }) };
}

function keepAliveScheduler(logger: Logger): IntervalScheduler {
  return new IntervalScheduler((error) => {
    void logger.log({
      level: 'warn',
      logger: 'runs',
      message: `Keep-alive failed: ${String(error)}`,
    });
  });
}

// RF-1006, RF-1108
export function composeRuns(parts: RunParts): RunComposition {
  const { pool, logger, clock, masker, dataDir, version } = parts;
  const runs = new PgRunIndex(pool);
  const ids = new TimestampIdGenerator(clock);
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
  const projects = new PgProjectRepository(pool);
  const scan = composeScan(parts, { writer, manifests }, projects);
  const queue = new RunQueue({
    runs,
    lifecycle,
    executors: { scan: scan.executor },
    clock,
    logger,
    maxRunning: DEFAULT_MAX_RUNNING_RUNS,
  });
  const submitRun = new SubmitRun({
    runs,
    manifests,
    queue,
    ids,
    clock,
    rosettaVersion: version,
  });
  return {
    queue,
    services: {
      startRun: new StartRun({ projects, submit: submitRun }),
      subscribeRunEvents: new SubscribeRunEvents({ runs, history: log, feed: broadcaster }),
      stopRun: new StopRun({ queue }),
      heartbeat: keepAliveScheduler(logger),
      streams: new StreamRegistry(),
    },
    submitRun,
    async recover() {
      await scan.fetcher.discardPartialFolders();
      await queue.recover();
    },
  };
}
