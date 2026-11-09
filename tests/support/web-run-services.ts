import type { GetJourney } from '../../src/application/use-cases/get-journey.js';
import { startRunOf } from './journey-lookups.js';
import { startConsentsOf } from '../../src/application/use-cases/consent-use-cases.js';
import { MemoryProjectConsents } from '../../src/infrastructure/db/memory-project-consents.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import type { RoleKeyDependencies } from '../../src/application/runs/role-keys.js';
import { testRoleKeys } from './web-role-keys.js';
import { NO_LISTED_MODELS } from '../../src/application/models/model-list.js';
import type { ApplicationLogReader } from '../../src/application/ports/application-log-reader.js';
import type { PlanningBriefStore } from '../../src/application/ports/planning-brief-store.js';
import type { AnswersFile } from '../../src/application/ports/answers-file.js';
import type { ArchiveWriter } from '../../src/application/ports/archive-writer.js';
import type { Clock } from '../../src/application/ports/clock.js';
import type { RunCallReader } from '../../src/application/ports/run-call-reader.js';
import type { ReportDownloads } from '../../src/application/ports/report-downloads.js';
import type { ReportWriter } from '../../src/application/ports/report-writer.js';
import type { RunFileReader } from '../../src/application/ports/run-file-reader.js';
import { getRunOf, pageReads } from './page-reads.js';
import type { RunTextFiles } from '../../src/application/ports/run-text-files.js';
import { EstimateRun } from '../../src/application/estimate/estimate-run.js';
import { BuildReport } from '../../src/application/use-cases/build-report.js';
import { ReadRunFile } from '../../src/application/use-cases/read-run-file.js';
import { ExportZip } from '../../src/application/use-cases/export-zip.js';
import { GetCallTranscript } from '../../src/application/use-cases/get-call-transcript.js';
import { journeyFromFiles } from './journey-from-files.js';
import { CountAnsweredQuestions } from '../../src/application/use-cases/count-answered-questions.js';
import type { Logger } from '../../src/application/ports/logger.js';
import type { PriorCards, QuestionReopener } from '../../src/application/ports/prior-cards.js';
import { ListAnswers } from '../../src/application/use-cases/list-answers.js';
import { ListRunCalls } from '../../src/application/use-cases/list-run-calls.js';
import { ListRunLogs } from '../../src/application/use-cases/list-run-logs.js';
import { RecordAnswers } from '../../src/application/use-cases/record-answers.js';
import { ReopenQuestion } from '../../src/application/use-cases/reopen-question.js';
import { continueRunOf } from './continue-run-of.js';
import { ResumeRun } from '../../src/application/use-cases/resume-run.js';
import type { ProviderSetFactory } from '../../src/application/ports/provider-set-factory.js';
import type { UserRepository } from '../../src/application/ports/user-repository.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import type { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import type { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import type { TextMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { composeConsentRoutes } from '../../src/presentation/compose-consents.js';
import { composeObservability } from '../../src/presentation/compose-observability.js';
import type { ObservabilityServices } from '../../src/presentation/web/observability-routes.js';
import type { ServerOptions } from '../../src/presentation/web/server.js';
import { MemoryArchiveWriter } from './memory-archive-writer.js';
import { RecordingLogger } from './recording-logger.js';
import type { MemoryOutputWriter } from './memory-output-writer.js';
import { MemoryRunFileReader } from './memory-run-file-reader.js';
import { planOptionsService } from './web-plan-options.js';
import {
  FixedReportCards,
  RecordingReportDownloads,
  MapRunTextFiles,
  RecordingReportWriter,
} from './report-doubles.js';
import { catalogAreas, estimatePrices, FixedScans } from './estimate-harness.js';
import type { RunHarness } from './run-harness.js';
import { deepenServices } from './web-deepen-services.js';
import { noQuestionCounts } from './recording-journey-facts.js';

/** RF-008, RF-504, RF-506: where the run folder is read from, zipped and reported on. */
export interface RunOutputs {
  readonly archives: ArchiveWriter;
  readonly files: RunFileReader;
  readonly text: RunTextFiles;
  readonly reportWriter: ReportWriter;
  readonly reportDownloads: ReportDownloads;
}

/** What a test may give in place of the memory doubles of the run outputs. */
export interface RunOutputGiven {
  readonly archiveWriter?: ArchiveWriter | undefined;
  readonly runFileReader?: RunFileReader | undefined;
  readonly report?:
    | {
        readonly text: RunTextFiles;
        readonly writer: ReportWriter;
        readonly downloads?: ReportDownloads | undefined;
      }
    | undefined;
}

/** The memory doubles of the run outputs, which a test seeds and inspects. */
export interface RunOutputDoubles {
  readonly archives: MemoryArchiveWriter;
  readonly runFiles: MemoryRunFileReader;
  readonly reportWriter: RecordingReportWriter;
}

/** The run outputs of a test server: what the test gave, or the memory doubles. */
export function runOutputs(given: RunOutputGiven): {
  readonly outputs: RunOutputs;
  readonly doubles: RunOutputDoubles;
} {
  const doubles = {
    archives: new MemoryArchiveWriter(),
    runFiles: new MemoryRunFileReader(),
    reportWriter: new RecordingReportWriter(),
  };
  return {
    doubles,
    outputs: {
      archives: given.archiveWriter ?? doubles.archives,
      files: given.runFileReader ?? doubles.runFiles,
      text: given.report?.text ?? new MapRunTextFiles({ 'spec.md': '# Specification\n' }),
      reportWriter: given.report?.writer ?? doubles.reportWriter,
      reportDownloads: given.report?.downloads ?? new RecordingReportDownloads(),
    },
  };
}

/** RF-1011: what the composition root's calls and logs routes read, when a test gives a data folder. */
interface ObservedFiles {
  readonly callFiles: MemoryOutputWriter;
  readonly masker: TextMasker;
  /** RF-614: the saved briefs `StartRun` reads (RST-1801). */
  readonly briefs: PlanningBriefStore;
  readonly logDir?: string | undefined;
}

/**
 * RF-1011: the use cases of the calls and logs routes. By default over the harness's run folders and
 * the logger's entries; with a data folder, the composition root's, over the same run folders and the
 * daily log files there.
 */
function observability(
  runs: RunHarness,
  readers: {
    readonly calls: RunCallReader;
    readonly logs: ApplicationLogReader;
    readonly clock: Clock;
  },
  files: ObservedFiles,
): ObservabilityServices {
  const { calls, logs, clock } = readers;
  if (files.logDir !== undefined) {
    const { callFiles, masker, logDir } = files;
    const parts = { runs: runs.runs, manifests: runs.manifests, masker, clock };
    return composeObservability({ ...parts, writer: callFiles, dataDir: logDir });
  }
  return {
    listRunCalls: new ListRunCalls({ runs: runs.runs, calls, manifests: runs.manifests }),
    getCallTranscript: new GetCallTranscript({ runs: runs.runs, calls }),
    listRunLogs: new ListRunLogs({ runs: runs.runs, logs, clock }),
  };
}

interface AnswerStores {
  readonly projects: MemoryProjectRepository;
  readonly answers: AnswersFile;
  readonly priorCards: PriorCards & QuestionReopener;
  readonly logger: Logger;
}

/** RF-1007, RF-241: the answers use cases of the harness, over the answers file and the cards. */
function answerServices(
  runs: RunHarness,
  stores: AnswerStores,
): Pick<
  ServerOptions['runs'],
  'listAnswers' | 'recordAnswers' | 'reopenQuestion' | 'countAnswered'
> {
  const { projects, answers, priorCards: cards, logger } = stores;
  return {
    listAnswers: new ListAnswers({ runs: runs.runs, answers, cards }),
    recordAnswers: new RecordAnswers({ runs: runs.runs, answers, cards, counts: noQuestionCounts }),
    reopenQuestion: new ReopenQuestion({
      runs: runs.runs,
      answers,
      cards,
      logger,
      counts: noQuestionCounts,
    }),
    countAnswered: new CountAnsweredQuestions({ projects, answers, cards }),
  };
}

/** RF-504: the report use case over the harness's runs and the test's report doubles. */
function reportOf(
  runs: RunHarness,
  outputs: RunOutputs,
  extra: {
    readonly answers: AnswersFile;
    readonly priorCards: PriorCards;
    readonly clock: Clock;
  },
): BuildReport {
  return new BuildReport({
    runs: runs.runs,
    manifests: runs.manifests,
    history: runs.events,
    files: outputs.text,
    writer: outputs.reportWriter,
    cards: new FixedReportCards(),
    priorCards: extra.priorCards,
    downloads: outputs.reportDownloads,
    scans: new FixedScans(catalogAreas),
    logger: new RecordingLogger(),
    ...{ answers: extra.answers, costs: new MemoryCostTotals(), clock: extra.clock },
  });
}

/** RF-615: the journey use case over the harness runs, manifests and events and the answers files. */
function journeyOf(
  runs: RunHarness,
  stores: AnswerStores & ObservedFiles & { readonly answerFiles: MemoryOutputWriter },
): GetJourney {
  return journeyFromFiles({
    ...{ projects: stores.projects, runs: runs.runs, manifests: runs.manifests },
    ...{ history: runs.events, briefs: stores.briefs, answers: stores.answers },
    cards: new FileRunCards(stores.answerFiles),
    priorCards: stores.priorCards,
  });
}

/** RF-1007, RF-615: the answers use cases and the journey of the harness. */
function answerAndJourney(
  runs: RunHarness,
  stores: AnswerStores & ObservedFiles & { readonly answerFiles: MemoryOutputWriter },
) {
  return { ...answerServices(runs, stores), getJourney: journeyOf(runs, stores) };
}

/** DEC-209: one store of the project's consents, which every start of the test server shares. */
function consentsOf(projects: MemoryProjectRepository, clock: Clock) {
  const consents = new MemoryProjectConsents(projects);
  return startConsentsOf({ consents, clock, ids: new SequenceIdGenerator() });
}

/** RF-003, RF-209, DEC-209: Start run and Start Deepen, which share the project's consents. */
function startServices(
  runs: RunHarness,
  stores: Parameters<typeof deepenServices>[1] & {
    readonly briefs: PlanningBriefStore;
    readonly clock: Clock;
    readonly roleKeys: RoleKeyDependencies;
    readonly consents: ReturnType<typeof consentsOf>;
  },
): Pick<ServerOptions['runs'], 'startRun' | keyof ReturnType<typeof deepenServices>> {
  const { projects, keys, roleKeys, briefs, consents } = stores;
  return {
    startRun: startRunOf({ ...runs, projects, briefs, roleKeys, consents }),
    ...deepenServices(runs, { projects, keys, roleKeys, consents }),
  };
}

export function runServices(
  runs: RunHarness,
  stores: {
    readonly projects: MemoryProjectRepository;
    readonly keys: MemoryProviderKeyRepository;
    readonly answers: AnswersFile;
    readonly priorCards: PriorCards & QuestionReopener;
    readonly logger: Logger;
    readonly calls: RunCallReader;
    readonly logs: ApplicationLogReader;
    readonly clock: Clock;
    readonly users: UserRepository;
    readonly factory: ProviderSetFactory;
    readonly answerFiles: MemoryOutputWriter;
  } & ObservedFiles,
  route: Pick<ServerOptions['runs'], 'heartbeat' | 'streams' | 'clock'>,
  outputs: RunOutputs,
): ServerOptions['runs'] {
  const { projects, keys, calls, logs, clock, answers } = stores;
  const roleKeys = testRoleKeys(stores.users, keys); // RF-431
  const consents = consentsOf(projects, clock); // DEC-209: one store for every start and the routes
  return {
    getRun: getRunOf(runs, outputs.text),
    ...pageReads(runs.runs, outputs.text),
    subscribeRunEvents: runs.subscribe,
    stopRun: runs.stop,
    continueRun: continueRunOf(runs, clock),
    resumeRun: new ResumeRun({
      ...{ projects, runs: runs.runs, manifests: runs.manifests, queue: runs.queue, clock },
      ...{ roleKeys, problem: () => Promise.resolve(undefined) },
    }),
    exportZip: new ExportZip({ runs: runs.runs, archives: outputs.archives }),
    readRunFile: new ReadRunFile({ runs: runs.runs, files: outputs.files }),
    buildReport: reportOf(runs, outputs, { answers, priorCards: stores.priorCards, clock }),
    ...answerAndJourney(runs, stores),
    ...observability(runs, { calls, logs, clock }, stores),
    ...startServices(runs, { ...stores, roleKeys, consents }),
    suggestPlanOptions: planOptionsService({
      ...{ projects, users: stores.users, logger: stores.logger, files: stores.answerFiles },
      ...{ runs: runs.runs, providers: stores.factory, consents },
    }),
    ...composeConsentRoutes({ projects, consents }), // RF-143, P8-81
    estimateRun: new EstimateRun({
      ...{ projects, runs: runs.runs, scans: new FixedScans(catalogAreas), keys },
      ...{ priceTable: estimatePrices, models: NO_LISTED_MODELS, reasoningModels: () => false },
      roleKeys,
    }),
    ...route,
  };
}
