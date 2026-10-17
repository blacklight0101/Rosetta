import { EstimateRun } from '../application/estimate/estimate-run.js';
import { fileURLToPath } from 'node:url';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { ProviderSetFactory } from '../application/ports/provider-set-factory.js';
import type { ParseBudget } from '../infrastructure/scan/packs/parse-budget.js';
import { RunLifecycle } from '../application/runs/run-lifecycle.js';
import { DEFAULT_MAX_RUNNING_RUNS, RunQueue } from '../application/runs/run-queue.js';
import { BuildReport } from '../application/use-cases/build-report.js';
import { ExportZip } from '../application/use-cases/export-zip.js';
import { GetRun } from '../application/use-cases/get-run.js';
import { CountAnsweredQuestions } from '../application/use-cases/count-answered-questions.js';
import { FilePriorCards } from '../infrastructure/cards/prior-cards.js';
import { ReadOverview } from '../application/use-cases/read-overview.js';
import { ListAnswers } from '../application/use-cases/list-answers.js';
import { RecordAnswers } from '../application/use-cases/record-answers.js';
import { ReopenQuestion } from '../application/use-cases/reopen-question.js';
import { ReadRunFile } from '../application/use-cases/read-run-file.js';
import { RunScan } from '../application/use-cases/run-scan.js';
import { StartRun } from '../application/use-cases/start-run.js';
import { ResumeRun } from '../application/use-cases/resume-run.js';
import { resumeProblemCheck } from '../application/understand/resume-problem.js';
import { FileTaskResults } from '../infrastructure/cards/file-task-results.js';
import { StopRun } from '../application/use-cases/stop-run.js';
import { SubmitRun } from '../application/use-cases/submit-run.js';
import { SubscribeRunEvents } from '../application/use-cases/subscribe-run-events.js';
import type { PriceTable } from '../domain/budget/price-table.js';
import { FileAnswersFile } from '../infrastructure/cards/answers-file.js';
import { RosettaError } from '../domain/errors/rosetta-error.js';
import { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import { PgProviderKeyRepository } from '../infrastructure/db/pg-provider-key-repository.js';
import { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { FanOutSink } from '../infrastructure/events/fan-out-sink.js';
import { JsonlEventLog } from '../infrastructure/events/jsonl-event-log.js';
import { SseBroadcaster } from '../infrastructure/events/sse-broadcaster.js';
import { FileRunManifestStore } from '../infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import { FileRunTextFiles } from '../infrastructure/files/file-run-text-files.js';
import { NodeRunFileReader } from '../infrastructure/files/node-run-file-reader.js';
import { YazlArchiveWriter } from '../infrastructure/files/yazl-archive-writer.js';
import type { FetchFunction } from '../infrastructure/github/github-http-client.js';
import { GitHubSnapshotFetcher } from '../infrastructure/github/github-snapshot-fetcher.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import type { LanguagePackRegistry } from '../infrastructure/scan/packs/pack-registry.js';
import { SnapshotScanPipeline } from '../infrastructure/scan/scan-pipeline.js';
import { IntervalScheduler } from '../infrastructure/system/interval-scheduler.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import { FileReportWriter } from '../infrastructure/report/file-report-writer.js';
import type { StreamRegistry } from './web/event-stream.js';
import { composeObservability } from './compose-observability.js';
import { composePlan } from './compose-plan.js';
import { composeScanResults, composeUnderstand, ollamaHostOf } from './compose-understand.js';
import type { ObservabilityServices } from './web/observability-routes.js';
import type { RunServices } from './web/run-routes.js';
import type { StartUpSteps } from './start-up.js';

// Architecture section 2 (composition root), RF-1006, RF-1108, RF-003: the run index, the event
// log with the live broadcaster, the manifest store, the run queue and the use cases behind the run
// routes. The stage executors are registered here (scan P1-23, understand P1-33, plan P3-09); SubmitRun
// refuses a stage without one with RST-2305 (409); StartRun names the stages the API starts (RF-003).

// This file is at the same depth in `src/` and in the built `dist/`, so `../../` is the repository root.
const reportTemplates = fileURLToPath(new URL('../../templates/report/', import.meta.url));

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
  /** `ROSETTA_SCAN_PARSE_BUDGET_MS`: the scan-wide time the packs may spend on one scan (RF-110). */
  readonly parseBudget: ParseBudget;
  /** Test mode only (TestDoubles): the fake GitHub behind the snapshot fetcher. */
  readonly fetch?: FetchFunction;
  /**
   * The provider factory: the only way the stage executors get a provider (ADR-003). In test mode
   * it builds the model double for every role (ADR-008).
   */
  readonly providers: ProviderSetFactory;
  /** `ROSETTA_OLLAMA_URL`; an Ollama on another host needs the cloud consent (RF-143). */
  readonly ollamaUrl: string | undefined;
  /** The shipped price table the estimate prices the roles with (RF-425). */
  readonly priceTable: PriceTable;
  /** RF-1101: the open event streams, ended with their session by the session store. */
  readonly streams: StreamRegistry;
}

export interface RunComposition {
  readonly services: RunServices;
  /** Starts queued runs, stops runs, recovers after a restart. */
  readonly queue: RunQueue;
  /** Accepts a run into the queue; the stage routes call it. */
  readonly submitRun: SubmitRun;
  /**
   * Start-up only, before the server listens: deletes the partial snapshot folders an interrupted
   * download left (RF-122). A failure is a warning. Not part of `recover`, which the scheduler runs
   * every minute while downloads may be in progress.
   */
  discardPartialSnapshots(): Promise<void>;
  /** Ends the runs the earlier process left running and starts what can start (RF-1108). */
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
    ...(parts.fetch === undefined ? {} : { fetch: parts.fetch }),
  });
  const pipeline = new SnapshotScanPipeline({
    ...{
      writer: stores.writer,
      masker,
      logger,
      packs: parts.packs,
      parseBudget: parts.parseBudget,
    },
  });
  const { manifests } = stores;
  return {
    fetcher,
    executor: new RunScan({ fetcher, projects, pipeline, manifests, clock, logger }),
  };
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

interface ServiceParts {
  readonly parts: RunParts;
  readonly writer: NodeOutputWriter;
  readonly manifests: FileRunManifestStore;
  readonly runs: PgRunIndex;
  readonly log: JsonlEventLog;
  readonly broadcaster: SseBroadcaster;
  readonly projects: PgProjectRepository;
  readonly submitRun: SubmitRun;
  readonly queue: RunQueue;
  readonly scans: ReturnType<typeof composeScanResults>;
  readonly answers: FileAnswersFile;
  readonly observability: ObservabilityServices;
}

/** The use cases behind the run routes (RF-003, RF-1006, RF-1108, RF-143). */
function runServices(service: ServiceParts): RunServices {
  const { parts, runs, log, broadcaster, projects, submitRun, queue, scans, answers } = service;
  const { writer, manifests, observability } = service;
  const cards = new FilePriorCards(writer);
  const ollamaHost = ollamaHostOf(parts.ollamaUrl);
  return {
    startRun: new StartRun({
      projects,
      submit: submitRun,
      ...(ollamaHost === undefined ? {} : { ollamaHost }),
    }),
    estimateRun: new EstimateRun({
      ...{ projects, runs, scans },
      keys: new PgProviderKeyRepository(parts.pool),
      priceTable: parts.priceTable,
    }),
    getRun: new GetRun({ runs, queue, files: new FileRunTextFiles(writer) }),
    subscribeRunEvents: new SubscribeRunEvents({ runs, history: log, feed: broadcaster }),
    stopRun: new StopRun({ queue }),
    resumeRun: new ResumeRun({
      ...{ projects, runs, manifests, queue, clock: parts.clock },
      problem: resumeProblemCheck({
        runs,
        scans,
        taskResults: new FileTaskResults({ writer, masker: parts.masker }),
      }),
      ...(ollamaHost === undefined ? {} : { ollamaHost }),
    }),
    exportZip: new ExportZip({ runs, archives: new YazlArchiveWriter(parts.dataDir) }),
    readRunFile: new ReadRunFile({ runs, files: new NodeRunFileReader(parts.dataDir) }),
    buildReport: new BuildReport({
      ...{ runs, manifests, history: log, scans, logger: parts.logger },
      files: new FileRunTextFiles(writer),
      writer: new FileReportWriter({ writer, masker: parts.masker, assetsFolder: reportTemplates }),
    }),
    listAnswers: new ListAnswers({ runs, answers, cards }),
    recordAnswers: new RecordAnswers({ runs, answers, cards }),
    reopenQuestion: new ReopenQuestion({ runs, answers, cards, logger: parts.logger }),
    countAnswered: new CountAnsweredQuestions({ projects, answers, cards }),
    readOverview: new ReadOverview({ runs, files: new FileRunTextFiles(writer) }),
    ...observability,
    heartbeat: keepAliveScheduler(parts.logger),
    streams: parts.streams,
    clock: parts.clock,
  };
}

// RF-122, P1-73: an interrupted download leaves a `.partial-*` folder in `<data>/sources/`; the
// start-up discards them once, before the server listens and before the queue accepts runs; the
// periodic queue sweep never does (a download running then would lose its folder). A failure to
// discard is a warning (error code or name and the folder name only, no message text) and does not
// stop the start-up (the next download uses a fresh partial folder of its own).
async function discardPartialSnapshots(
  fetcher: GitHubSnapshotFetcher,
  logger: Logger,
): Promise<void> {
  try {
    await fetcher.discardPartialFolders();
  } catch (error) {
    await logger.log({
      level: 'warn',
      logger: 'start-up',
      message: `Partial snapshot folders in sources/ could not be discarded (${error instanceof Error ? error.name : 'unknown error'})`,
      ...(error instanceof RosettaError ? { code: error.code } : {}),
    });
  }
}

/** The two run steps of the start-up sequence, in order: discard partial folders, then recover. */
export function runStartUpSteps(
  runs: RunComposition,
): Pick<StartUpSteps, 'discardPartialSnapshots' | 'recoverRuns'> {
  return {
    discardPartialSnapshots: () => runs.discardPartialSnapshots(),
    recoverRuns: () => runs.recover(),
  };
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
  const answers = new FileAnswersFile({ writer, masker });
  const stage = { ...parts, writer, manifests, projects, runs, ids, answers };
  const queue = new RunQueue({
    runs,
    lifecycle,
    executors: {
      scan: scan.executor,
      understand: composeUnderstand(stage),
      plan: composePlan(stage),
    },
    clock,
    logger,
    maxRunning: DEFAULT_MAX_RUNNING_RUNS,
  });
  const submitRun = new SubmitRun({ runs, manifests, queue, ids, clock, rosettaVersion: version });
  return {
    queue,
    services: runServices({
      ...{ parts, writer, manifests, runs, log, broadcaster, projects, submitRun, queue, answers },
      observability: composeObservability({ runs, manifests, writer, masker, clock, dataDir }),
      scans: composeScanResults({ dataDir, writer, manifests, logger }),
    }),
    submitRun,
    discardPartialSnapshots: () => discardPartialSnapshots(scan.fetcher, logger),
    recover: () => queue.recover(),
  };
}
