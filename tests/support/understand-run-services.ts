import { RunLifecycle } from '../../src/application/runs/run-lifecycle.js';
import { RunQueue } from '../../src/application/runs/run-queue.js';
import { RunScan } from '../../src/application/use-cases/run-scan.js';
import { RunUnderstand } from '../../src/application/use-cases/run-understand.js';
import { FileCostReportWriter } from '../../src/infrastructure/budget/cost-report-files.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FilePriorCards } from '../../src/infrastructure/cards/prior-cards.js';
import { FileCardOutputs } from '../../src/infrastructure/cards/file-card-outputs.js';
import { FileTaskResults } from '../../src/infrastructure/cards/file-task-results.js';
import { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { FanOutSink } from '../../src/infrastructure/events/fan-out-sink.js';
import { JsonlEventLog } from '../../src/infrastructure/events/jsonl-event-log.js';
import { FileRunManifestStore } from '../../src/infrastructure/files/file-run-manifest-store.js';
import type { WorkspaceFile, WriteRefusal } from '../../src/application/ports/output-writer.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { err, type Result } from '../../src/domain/errors/result.js';
import { NodeOutputWriter } from '../../src/infrastructure/files/node-output-writer.js';
import { FakeSourceFetcher } from '../../src/infrastructure/github/fake-source-fetcher.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import {
  loadMergePrompt,
  loadOverviewPrompt,
  loadAnswersPrompt,
  loadReaderPrompts,
} from '../../src/infrastructure/prompts/prompt-files.js';
import { loadVerifierPrompts } from '../../src/infrastructure/prompts/verifier-prompt-files.js';
import { loadTextToolProtocol } from '../../src/infrastructure/providers/ollama/text-tool-protocol-file.js';
import { CSharpPack } from '../../src/infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../../src/infrastructure/scan/packs/pack-registry.js';
import { SnapshotScanPipeline } from '../../src/infrastructure/scan/scan-pipeline.js';
import { FileScanResults } from '../../src/infrastructure/scan/scan-results.js';
import { FailingCardOutputs } from './failing-card-outputs.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { fixtureRoot, type FixtureRepository } from './scan-harness.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import type { UnderstandProviders } from './understand-providers.js';

// RF-200: the stores and the run queue of the understand harness, over memory indexes and the
// real file writers. Kept apart from understand-run-harness.ts, which holds the harness itself.

const commitSha = 'c'.repeat(40);

function fixtureFetcher(clock: FixedClock, root: string): FakeSourceFetcher {
  return new FakeSourceFetcher(
    [
      {
        owner: 'octo',
        repo: 'demo',
        defaultBranch: 'main',
        refs: { main: commitSha },
        rootDir: root,
        snapshotHash: `sha256:${'cd'.repeat(32)}`,
        fileCount: 13,
        totalBytes: 4096,
      },
    ],
    clock,
  );
}

export interface Stores {
  /** The fixture repository the scans read (the C# fixture unless a test chose another). */
  readonly fixture: FixtureRepository;
  /** The folder of the repository the runs scan: a fixture, or a copy a test changed. */
  readonly repoRoot: string;
  readonly clock: FixedClock;
  readonly masker: SecretMasker;
  readonly logger: MemoryLogger;
  readonly writer: NodeOutputWriter;
  readonly manifests: FileRunManifestStore;
  readonly log: JsonlEventLog;
  readonly runs: MemoryRunIndex;
  readonly projects: MemoryProjectRepository;
  readonly users: MemoryUserRepository;
}

/** A writer that refuses to remove a card file, as a workspace that has lost the right to would. */
class RefusingRemovalWriter extends NodeOutputWriter {
  override remove(file: WorkspaceFile): Promise<Result<void, WriteRefusal>> {
    const message = `The file ${file.path} cannot be removed.`;
    return Promise.resolve(
      err({ code: ERROR_CODES.pathOutsideRoot, reason: 'outside-workspace', message }),
    );
  }
}

export function stores(
  dataDir: string,
  refuseRemoval = false,
  fixture: FixtureRepository = 'webforms-csharp',
  repository?: string,
): Stores {
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const writer = refuseRemoval
    ? new RefusingRemovalWriter({ dataDir, logger })
    : new NodeOutputWriter({ dataDir, logger });
  return {
    ...{ clock, masker, logger, writer, fixture },
    repoRoot: repository ?? fixtureRoot(fixture),
    manifests: new FileRunManifestStore({ writer, masker }),
    log: new JsonlEventLog({ writer, masker }),
    runs: new MemoryRunIndex(),
    projects: new MemoryProjectRepository(),
    users: new MemoryUserRepository(),
  };
}

/** The scans of the test runs: the real file adapter over the C# fixture. */
export function scanResultsOf(s: Stores): FileScanResults {
  const { writer, manifests, logger } = s;
  return new FileScanResults({
    writer,
    manifests,
    snapshotRoot: () => s.repoRoot,
    logger,
  });
}

function understandExecutor(
  s: Stores,
  providers: UnderstandProviders,
  cardWritesFail: () => boolean,
): RunUnderstand {
  const { writer, masker, logger, manifests, clock } = s;
  return new RunUnderstand({
    ...{ projects: s.projects, runs: s.runs, users: s.users, manifests, clock, logger },
    scans: scanResultsOf(s),
    providers: providers.factory,
    runSinks: providers.runSinks,
    cards: new FailingCardOutputs(new FileCardOutputs({ writer, masker, logger }), cardWritesFail),
    taskResults: new FileTaskResults({ writer, masker }),
    answers: new FileAnswersFile({ writer, masker }),
    ledger: providers.ledger,
    costTotals: new MemoryCostTotals(),
    costReports: new FileCostReportWriter({ writer, masker }),
    prompts: () => loadReaderPrompts('prompts'),
    mergePrompt: () => loadMergePrompt('prompts'),
    overviewPrompt: () => loadOverviewPrompt('prompts'),
    verifierPrompts: () => loadVerifierPrompts('prompts'),
    textToolProtocol: () => loadTextToolProtocol('prompts'),
    answersPrompt: () => loadAnswersPrompt('prompts'),
    priorCards: new FilePriorCards(writer),
    ids: new SequenceIdGenerator(),
  });
}

export async function queueOf(
  s: Stores,
  providers: UnderstandProviders,
  cardWritesFail: () => boolean = () => false,
): Promise<RunQueue> {
  const { runs, manifests, log, clock, logger, projects, writer, masker } = s;
  const pipeline = new SnapshotScanPipeline({
    ...{ writer, masker, logger },
    packs: new LanguagePackRegistry([await CSharpPack.create()]),
  });
  const fetcher = fixtureFetcher(clock, s.repoRoot);
  const lifecycle = new RunLifecycle({
    ...{ runs, manifests, clock, logger },
    sink: new FanOutSink([log]),
    history: log,
  });
  return new RunQueue({
    ...{ runs, lifecycle, clock, logger },
    executors: {
      scan: new RunScan({ fetcher, projects, pipeline, manifests, clock, logger }),
      understand: understandExecutor(s, providers, cardWritesFail),
    },
    maxRunning: 2,
  });
}
