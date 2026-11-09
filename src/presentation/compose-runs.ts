import { journeyLookupOf } from '../application/runs/approved-journey.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { ProviderSetFactory } from '../application/ports/provider-set-factory.js';
import type { ParseBudget } from '../infrastructure/scan/packs/parse-budget.js';
import type { OpenQuestionCounts } from '../application/journey/open-question-counts.js';
import { composeLifecycle } from './compose-lifecycle.js';
import { DEFAULT_MAX_RUNNING_RUNS, RunQueue } from '../application/runs/run-queue.js';
import { ExportZip } from '../application/use-cases/export-zip.js';
import { GetRun } from '../application/use-cases/get-run.js';
import { CountAnsweredQuestions } from '../application/use-cases/count-answered-questions.js';
import { ListAnswers } from '../application/use-cases/list-answers.js';
import { RecordAnswers } from '../application/use-cases/record-answers.js';
import { ReopenQuestion } from '../application/use-cases/reopen-question.js';
import { ReadRunFile } from '../application/use-cases/read-run-file.js';
import { StartRun } from '../application/use-cases/start-run.js';
import {
  ContinueRun,
  type ContinueRunDependencies,
} from '../application/use-cases/continue-run.js';
import { StopRun } from '../application/use-cases/stop-run.js';
import { SubmitRun } from '../application/use-cases/submit-run.js';
import { SubscribeRunEvents } from '../application/use-cases/subscribe-run-events.js';
import type { ModelList } from '../application/models/model-list.js';
import type { PriceTable } from '../domain/budget/price-table.js';
import type { ReasoningModels } from '../application/models/model-list.js';
import { FileAnswersFile } from '../infrastructure/cards/answers-file.js';
import { RosettaError } from '../domain/errors/rosetta-error.js';
import { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import { composeEstimateRun } from './compose-estimate.js';
import { PgJourneyRecords } from '../infrastructure/db/pg-journey-records.js';
import { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { JsonlEventLog } from '../infrastructure/events/jsonl-event-log.js';
import { SseBroadcaster } from '../infrastructure/events/sse-broadcaster.js';
import { FileRunManifestStore } from '../infrastructure/files/file-run-manifest-store.js';
import { FilePlanningBriefStore } from '../infrastructure/files/file-planning-brief-store.js';
import { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import { FileRunTextFiles } from '../infrastructure/files/file-run-text-files.js';
import { NodeRunFileReader } from '../infrastructure/files/node-run-file-reader.js';
import { YazlArchiveWriter } from '../infrastructure/files/yazl-archive-writer.js';
import type { FetchFunction } from '../infrastructure/github/github-http-client.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import type { LanguagePackRegistry } from '../infrastructure/scan/packs/pack-registry.js';
import { IntervalScheduler } from '../infrastructure/system/interval-scheduler.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import type { KeySourceLookup } from '../application/ports/key-source-lookup.js';
import { composeScan } from './compose-scan.js';
import type { GitHubSnapshotFetcher } from '../infrastructure/github/github-snapshot-fetcher.js';
import type { StreamRegistry } from './web/event-stream.js';
import { composeRunReads } from './compose-run-reads.js';
import { composeDeepen, composeResume } from './compose-deepen.js';
import { composeObservability } from './compose-observability.js';
import { composePlan } from './compose-plan.js';
import { withPrivateCodeRecheck } from './compose-recheck.js';
import { composeConsentServices, composeConsents } from './compose-consents.js';
import {
  composeJourney,
  composeJourneyBackfill,
  composeQuestionCounts,
  composeRunEndFacts,
} from './compose-journey.js';
import type { ScheduledJob } from '../application/ports/scheduler.js';
import { composeBuildReport } from './compose-report.js';
import { composeScanResults, composeUnderstand, ollamaHostOf } from './compose-understand.js';
import type { ObservabilityServices } from './web/observability-routes.js';
import type { RunServices } from './web/run-routes.js';
import type { StartUpSteps } from './start-up.js';
import { keptPriorCards } from './kept-card-readers.js';

// Architecture section 2 (composition root), RF-1006, RF-1108, RF-003: the run index, the event log
// with the live broadcaster, the manifest store, the run queue and the use cases behind the run
// routes. The stage executors are registered here (scan P1-23, understand P1-33, plan P3-09);
// SubmitRun refuses a stage without one (RST-2305); StartRun names the API's stages.

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
  /** The shipped price table, and the reasoning models (Q-58), the estimate names (RF-425). */
  readonly priceTable: PriceTable;
  /** The shipped model list (Q-57). */
  readonly models: ModelList;
  readonly reasoningModels: ReasoningModels;
  /** RF-1101: the open event streams, ended with their session by the session store. */
  readonly streams: StreamRegistry;
  /** RF-1106, DEC-107: whether a role would use the user's or the server's key, for the start caps. */
  readonly keySources: KeySourceLookup;
}

export interface RunComposition {
  readonly services: RunServices;
  /** Starts queued runs, stops runs, recovers after a restart. */
  readonly queue: RunQueue;
  /** Accepts a run into the queue; the stage routes call it. */
  readonly submitRun: SubmitRun;
  /**
   * Start-up only, before the server listens: deletes the partial snapshot folders an interrupted
   * download left (RF-122); a failure is a warning. Not part of `recover`, which runs every minute.
   */
  discardPartialSnapshots(): Promise<void>;
  /** Ends the runs the earlier process left running and starts what can start (RF-1108). */
  recover(): Promise<void>;
  /** DEC-226: fills the journey facts of the rows from before they were stored (P8-139). */
  readonly journeyFactsBackfill: ScheduledJob;
  /** DEC-226: the one store of the open questions, which the history's run deletion shares (P8-139). */
  readonly questionCounts: OpenQuestionCounts;
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
  /** P8-139, DEC-226: an answer saved or a question reopened stores the open questions again. */
  readonly counts: OpenQuestionCounts;
}

/** RF-1108, RF-432: Stop (also Stop here of a paused run) and Continue (+N). */
function answerServices(
  deps: ContinueRunDependencies & { readonly queue: RunQueue },
): Pick<RunServices, 'stopRun' | 'continueRun'> {
  return { stopRun: new StopRun({ queue: deps.queue }), continueRun: new ContinueRun(deps) };
}

/**
 * The use cases behind the run routes (RF-003, RF-1006, RF-1108, RF-143). RF-432: the server sets the
 * approved amount of a start; RF-011: the journey record keeps the one amount of all its steps.
 * RF-431: every start path checks the roles' keys before a run is queued.
 */
function runServices(service: ServiceParts): RunServices {
  const { parts, runs, log, broadcaster, projects, submitRun, queue, scans, answers } = service;
  const { writer, manifests, observability, counts } = service;
  const cards = keptPriorCards(writer);
  const ollamaHost = ollamaHostOf(parts.ollamaUrl);
  const roleKeys = { users: new PgUserRepository(parts.pool), keys: parts.keySources };
  const estimateRun = composeEstimateRun(parts, { projects, runs, scans, roleKeys });
  const consents = composeConsents(parts.pool, parts.clock); // DEC-209: one store for every start
  return {
    startRun: new StartRun({
      ...{ projects, runs, manifests, submit: submitRun, roleKeys, consents },
      ...{ journey: journeyLookupOf(estimateRun), journeys: new PgJourneyRecords(parts.pool) },
      briefs: new FilePlanningBriefStore({ writer, masker: parts.masker }),
      ...(ollamaHost === undefined ? {} : { ollamaHost }),
    }),
    estimateRun,
    getRun: new GetRun({ runs, queue, manifests, files: new FileRunTextFiles(writer) }),
    getJourney: composeJourney({ projects, runs, pool: parts.pool }),
    subscribeRunEvents: new SubscribeRunEvents({ runs, history: log, feed: broadcaster }),
    ...answerServices({ runs, manifests, queue, clock: parts.clock }),
    resumeRun: composeResume({
      ...{ projects, runs, manifests, queue, scans, writer },
      ...{ clock: parts.clock, masker: parts.masker, ollamaHost, roleKeys },
    }),
    ...composeDeepen({
      ...{ pool: parts.pool, projects, runs, manifests, scans, submit: submitRun, writer },
      ...{ masker: parts.masker, priceTable: parts.priceTable, models: parts.models, ollamaHost },
      ...{ roleKeys, consents },
    }),
    exportZip: new ExportZip({ runs, archives: new YazlArchiveWriter(parts.dataDir) }),
    readRunFile: new ReadRunFile({ runs, files: new NodeRunFileReader(parts.dataDir) }),
    buildReport: composeBuildReport({
      ...{ pool: parts.pool, logger: parts.logger, clock: parts.clock, masker: parts.masker },
      ...{ writer, runs, manifests, history: log, scans, answers, dataDir: parts.dataDir },
    }),
    listAnswers: new ListAnswers({ runs, answers, cards, manifests }),
    recordAnswers: new RecordAnswers({ runs, answers, cards, manifests, counts }),
    reopenQuestion: new ReopenQuestion({
      ...{ runs, answers, cards, manifests, logger: parts.logger, counts },
    }),
    countAnswered: new CountAnsweredQuestions({ projects, answers, cards }),
    ...composeRunReads(runs, writer),
    // RF-608, RF-143, P8-81: Plan setup's options and the consent routes, over the starts' consents.
    ...composeConsentServices({ ...parts, writer, projects, runs, scans, ollamaHost, consents }),
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
  const projects = new PgProjectRepository(pool);
  const files = { pool, writer, masker, runs, logger };
  const stores = { runs, manifests, log, broadcaster, projects };
  const counts = composeQuestionCounts(files);
  const lifecycle = composeLifecycle(parts, stores, composeRunEndFacts(files, counts));
  const scan = composeScan({ ...parts, writer, manifests, projects });
  const answers = new FileAnswersFile({ writer, masker });
  const stage = { ...parts, writer, manifests, projects, runs, ids, answers };
  const queue = new RunQueue({
    runs,
    lifecycle,
    executors: {
      scan: scan.executor,
      ...withPrivateCodeRecheck(
        { understand: composeUnderstand(stage), plan: composePlan(stage) },
        { projects, logger, ollamaUrl: parts.ollamaUrl },
      ),
    },
    clock,
    logger,
    maxRunning: DEFAULT_MAX_RUNNING_RUNS,
  });
  const submitDeps = { runs, manifests, queue, ids, clock, rosettaVersion: version };
  const submitRun = new SubmitRun({ ...submitDeps, models: parts.models });
  return {
    queue,
    services: runServices({
      ...{ parts, writer, manifests, runs, log, broadcaster, projects, submitRun, queue, answers },
      counts,
      observability: composeObservability({ runs, manifests, writer, masker, clock, dataDir }),
      scans: composeScanResults({ dataDir, writer, manifests, logger, packs: parts.packs }),
    }),
    submitRun,
    discardPartialSnapshots: () => discardPartialSnapshots(scan.fetcher, logger),
    recover: () => queue.recover(),
    journeyFactsBackfill: composeJourneyBackfill({ ...files, history: log }),
    questionCounts: counts,
  };
}
