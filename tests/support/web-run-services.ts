import type { ApplicationLogReader } from '../../src/application/ports/application-log-reader.js';
import type { AnswersFile } from '../../src/application/ports/answers-file.js';
import type { ArchiveWriter } from '../../src/application/ports/archive-writer.js';
import type { Clock } from '../../src/application/ports/clock.js';
import type { RunCallReader } from '../../src/application/ports/run-call-reader.js';
import type { ReportWriter } from '../../src/application/ports/report-writer.js';
import type { RunFileReader } from '../../src/application/ports/run-file-reader.js';
import type { RunTextFiles } from '../../src/application/ports/run-text-files.js';
import { EstimateRun } from '../../src/application/estimate/estimate-run.js';
import { BuildReport } from '../../src/application/use-cases/build-report.js';
import { ReadRunFile } from '../../src/application/use-cases/read-run-file.js';
import { ExportZip } from '../../src/application/use-cases/export-zip.js';
import { GetCallTranscript } from '../../src/application/use-cases/get-call-transcript.js';
import { GetRun } from '../../src/application/use-cases/get-run.js';
import { ListAnswers } from '../../src/application/use-cases/list-answers.js';
import { ListRunCalls } from '../../src/application/use-cases/list-run-calls.js';
import { ListRunLogs } from '../../src/application/use-cases/list-run-logs.js';
import { RecordAnswers } from '../../src/application/use-cases/record-answers.js';
import { DeleteProject } from '../../src/application/use-cases/delete-project.js';
import { DeleteRun } from '../../src/application/use-cases/delete-run.js';
import { DeleteSnapshot } from '../../src/application/use-cases/delete-snapshot.js';
import { ListProjectOverview } from '../../src/application/use-cases/list-project-overview.js';
import { ListHistory } from '../../src/application/use-cases/list-history.js';
import { ListSnapshots } from '../../src/application/use-cases/list-snapshots.js';
import { ResumeRun } from '../../src/application/use-cases/resume-run.js';
import { StartRun } from '../../src/application/use-cases/start-run.js';
import type { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import type { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import type { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import type { TextMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { composeObservability } from '../../src/presentation/compose-observability.js';
import type { ObservabilityServices } from '../../src/presentation/web/observability-routes.js';
import type { ServerOptions } from '../../src/presentation/web/server.js';
import { MemoryArchiveWriter } from './memory-archive-writer.js';
import { RecordingLogger } from './recording-logger.js';
import type { MemoryLogger } from './memory-logger.js';
import type { MemoryOutputWriter } from './memory-output-writer.js';
import type { MemorySnapshotCache } from './memory-snapshot-cache.js';
import type { MemoryWorkspaceFolders } from './memory-workspace-folders.js';
import { MemoryRunFileReader } from './memory-run-file-reader.js';
import { MapRunTextFiles, RecordingReportWriter } from './report-doubles.js';
import { catalogAreas, estimatePrices, FixedScans } from './estimate-harness.js';
import type { RunHarness } from './run-harness.js';

/** RF-008, RF-504, RF-506: where the run folder is read from, zipped and reported on. */
export interface RunOutputs {
  readonly archives: ArchiveWriter;
  readonly files: RunFileReader;
  readonly text: RunTextFiles;
  readonly reportWriter: ReportWriter;
}

/** What a test may give in place of the memory doubles of the run outputs. */
export interface RunOutputGiven {
  readonly archiveWriter?: ArchiveWriter | undefined;
  readonly runFileReader?: RunFileReader | undefined;
  readonly report?: { readonly text: RunTextFiles; readonly writer: ReportWriter } | undefined;
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
    },
  };
}

/** RF-1011: what the composition root's calls and logs routes read, when a test gives a data folder. */
interface ObservedFiles {
  readonly callFiles: MemoryOutputWriter;
  readonly masker: TextMasker;
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

/** RF-1006, RF-1108: the run use cases of the harness, with the scan start over the projects. */
export function runServices(
  runs: RunHarness,
  stores: {
    readonly projects: MemoryProjectRepository;
    readonly keys: MemoryProviderKeyRepository;
    readonly answers: AnswersFile;
    readonly calls: RunCallReader;
    readonly logs: ApplicationLogReader;
    readonly clock: Clock;
  } & ObservedFiles,
  route: Pick<ServerOptions['runs'], 'heartbeat' | 'streams' | 'clock'>,
  outputs: RunOutputs,
): ServerOptions['runs'] {
  const { projects, keys, answers, calls, logs, clock } = stores;
  return {
    getRun: new GetRun({ runs: runs.runs, queue: runs.queue, files: outputs.text }),
    subscribeRunEvents: runs.subscribe,
    stopRun: runs.stop,
    resumeRun: new ResumeRun({
      ...{ projects, runs: runs.runs, manifests: runs.manifests, queue: runs.queue, clock },
    }),
    exportZip: new ExportZip({ runs: runs.runs, archives: outputs.archives }),
    readRunFile: new ReadRunFile({ runs: runs.runs, files: outputs.files }),
    buildReport: new BuildReport({
      runs: runs.runs,
      manifests: runs.manifests,
      history: runs.events,
      files: outputs.text,
      writer: outputs.reportWriter,
      scans: new FixedScans(catalogAreas),
      logger: new RecordingLogger(),
    }),
    listAnswers: new ListAnswers({ runs: runs.runs, answers }),
    recordAnswers: new RecordAnswers({ runs: runs.runs, answers }),
    ...observability(runs, { calls, logs, clock }, stores),
    startRun: new StartRun({ projects, submit: runs.submit }),
    // RF-425: every project's scan has the same fixed code map (Catalog and Orders).
    estimateRun: new EstimateRun({
      projects,
      runs: runs.runs,
      scans: new FixedScans(catalogAreas),
      keys,
      priceTable: estimatePrices,
    }),
    ...route,
  };
}

/** RF-1008, RF-1012: the history, deletion, snapshot and Projects page run use cases over the harness's memory adapters. */
export function historyServices(parts: {
  readonly runs: RunHarness;
  readonly projects: MemoryProjectRepository;
  readonly folders: MemoryWorkspaceFolders;
  readonly snapshots: MemorySnapshotCache;
  readonly logger: MemoryLogger;
  readonly costs: MemoryCostTotals;
}): ServerOptions['history'] {
  const { projects, folders, snapshots, logger, costs } = parts;
  const runs = parts.runs.runs;
  return {
    listHistory: new ListHistory({ projects, runs, folders }),
    listProjectOverview: new ListProjectOverview({ projects, runs, costs }),
    deleteRun: new DeleteRun({ runs, folders, logger }),
    deleteProject: new DeleteProject({ projects, runs, folders, logger }),
    listSnapshots: new ListSnapshots({ snapshots, runs }),
    deleteSnapshot: new DeleteSnapshot({ snapshots, runs, logger }),
  };
}
