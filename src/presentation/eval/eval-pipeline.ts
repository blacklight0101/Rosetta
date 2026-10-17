import { EstimateRun } from '../../application/estimate/estimate-run.js';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { Logger } from '../../application/ports/logger.js';
import type { ProviderSetFactory } from '../../application/ports/provider-set-factory.js';
import type { SecretBox } from '../../application/ports/secret-box.js';
import type { SourceFetcher } from '../../application/ports/source-fetcher.js';
import { RunLifecycle } from '../../application/runs/run-lifecycle.js';
import { RunQueue } from '../../application/runs/run-queue.js';
import { RunScan } from '../../application/use-cases/run-scan.js';
import { RunUnderstand } from '../../application/use-cases/run-understand.js';
import { StartRun } from '../../application/use-cases/start-run.js';
import { SubmitRun } from '../../application/use-cases/submit-run.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err } from '../../domain/errors/result.js';
import { FileCostReportWriter } from '../../infrastructure/budget/cost-report-files.js';
import { FileAnswersFile } from '../../infrastructure/cards/answers-file.js';
import { FileCardOutputs } from '../../infrastructure/cards/file-card-outputs.js';
import { FileTaskResults } from '../../infrastructure/cards/file-task-results.js';
import { FilePriorCards } from '../../infrastructure/cards/prior-cards.js';
import { MemoryCostLedger } from '../../infrastructure/db/memory-cost-ledger.js';
import { MemoryCostTotals } from '../../infrastructure/db/memory-cost-totals.js';
import { MemoryProjectRepository } from '../../infrastructure/db/memory-project-repository.js';
import { MemoryProviderKeyRepository } from '../../infrastructure/db/memory-provider-key-repository.js';
import { MemoryRunIndex } from '../../infrastructure/db/memory-run-index.js';
import { MemoryServerSettings } from '../../infrastructure/db/memory-server-settings.js';
import { MemoryUserRepository } from '../../infrastructure/db/memory-user-repository.js';
import { FanOutSink } from '../../infrastructure/events/fan-out-sink.js';
import { JsonlEventLog } from '../../infrastructure/events/jsonl-event-log.js';
import { FileRunManifestStore } from '../../infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../../infrastructure/files/node-output-writer.js';
import type { SecretMasker } from '../../infrastructure/guards/secret-masker.js';
import {
  loadAnswersPrompt,
  loadMergePrompt,
  loadOverviewPrompt,
  loadReaderPrompts,
} from '../../infrastructure/prompts/prompt-files.js';
import { loadVerifierPrompts } from '../../infrastructure/prompts/verifier-prompt-files.js';
import { loadTextToolProtocol } from '../../infrastructure/providers/ollama/text-tool-protocol-file.js';
import type { ServerKeys } from '../../infrastructure/providers/provider-access.js';
import type { LanguagePackRegistry } from '../../infrastructure/scan/packs/pack-registry.js';
import { SnapshotScanPipeline } from '../../infrastructure/scan/scan-pipeline.js';
import { FileScanResults } from '../../infrastructure/scan/scan-results.js';
import type { GuardedFactoryMaker } from '../compose-providers.js';
import { composeUnderstandSinks } from './eval-sinks.js';
import { RunEndWatcher } from './pipeline-target.js';

// Architecture section 2 (composition root), RNF-006, ADR-003, ADR-007, ADR-008: the stages of an
// evaluation, wired like the server's (compose-runs.ts, compose-understand.ts) but over the memory
// twins of the database ports, so `npm run eval` needs no PostgreSQL. The runs, snapshots and cards
// land in the evaluation's own data folder. The provider factory is the real one: every model call
// passes the egress guard and the budget guard, with the run cap, the evaluation account's daily
// cap (the total cap) and the server caps set to the evaluation's caps.

export interface PipelineParts {
  readonly dataDir: string;
  readonly fetcher: SourceFetcher;
  /** The folder of a snapshot by its key (the snapshot cache, or a fixture in tests). */
  readonly snapshotRoot: (key: string) => string;
  /** The guarded provider factory over the evaluation's stores (the release adapters, or a fake). */
  readonly providers: GuardedFactoryMaker;
  readonly serverKeys: ServerKeys;
  readonly ollamaUrl: string | undefined;
  readonly priceTable: PriceTable;
  readonly packs: LanguagePackRegistry;
  readonly promptsFolder: string;
  readonly rosettaVersion: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly masker: SecretMasker;
}

/** The evaluation has no user keys: it runs on the server keys of the environment only. */
export const noUserKeys: SecretBox = {
  keyVersion: 'none',
  knows: () => false,
  seal: () => {
    throw new Error('The evaluation stores no keys.');
  },
  open: () => err(ERROR_CODES.providerKeyUnreadable),
};

export interface Pipeline {
  readonly writer: NodeOutputWriter;
  readonly runs: MemoryRunIndex;
  readonly projects: MemoryProjectRepository;
  readonly users: MemoryUserRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly manifests: FileRunManifestStore;
  readonly scans: FileScanResults;
  readonly watcher: RunEndWatcher;
  readonly startRun: StartRun;
  readonly estimateRun: EstimateRun;
  readonly queue: RunQueue;
}

interface Stores {
  readonly writer: NodeOutputWriter;
  readonly runs: MemoryRunIndex;
  readonly projects: MemoryProjectRepository;
  readonly users: MemoryUserRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly manifests: FileRunManifestStore;
  readonly scans: FileScanResults;
  readonly keys: MemoryProviderKeyRepository;
  /** One ledger for the budget guard and the cost report of the runs. */
  readonly ledger: MemoryCostLedger;
}

function storesOf(parts: PipelineParts): Stores {
  const { dataDir, logger, masker } = parts;
  const writer = new NodeOutputWriter({ dataDir, logger });
  const manifests = new FileRunManifestStore({ writer, masker });
  return {
    ...{ writer, manifests, runs: new MemoryRunIndex(), projects: new MemoryProjectRepository() },
    users: new MemoryUserRepository(),
    serverSettings: new MemoryServerSettings({}),
    scans: new FileScanResults({ writer, manifests, logger, snapshotRoot: parts.snapshotRoot }),
    keys: new MemoryProviderKeyRepository(),
    ledger: new MemoryCostLedger(),
  };
}

function providersOf(parts: PipelineParts, s: Stores): ProviderSetFactory {
  const { masker, clock, ids, logger } = parts;
  return parts.providers({
    ...{ keys: s.keys, box: noUserKeys, serverKeys: parts.serverKeys, ollamaUrl: parts.ollamaUrl },
    ...{ serverSettings: s.serverSettings, ledger: s.ledger },
    ...{ priceTable: parts.priceTable, masker, clock, ids, logger },
  });
}

function understandOf(parts: PipelineParts, s: Stores): RunUnderstand {
  const { writer, manifests } = s;
  const { masker, logger, clock, promptsFolder: folder } = parts;
  return new RunUnderstand({
    ...{ projects: s.projects, runs: s.runs, users: s.users, manifests, clock, logger },
    scans: s.scans,
    providers: providersOf(parts, s),
    runSinks: composeUnderstandSinks(parts.dataDir, writer, masker),
    cards: new FileCardOutputs({ writer, masker, logger }),
    taskResults: new FileTaskResults({ writer, masker }),
    answers: new FileAnswersFile({ writer, masker }),
    ledger: s.ledger,
    costTotals: new MemoryCostTotals(),
    costReports: new FileCostReportWriter({ writer, masker }),
    prompts: () => loadReaderPrompts(folder),
    mergePrompt: () => loadMergePrompt(folder),
    overviewPrompt: () => loadOverviewPrompt(folder),
    verifierPrompts: () => loadVerifierPrompts(folder),
    textToolProtocol: () => loadTextToolProtocol(folder),
    answersPrompt: () => loadAnswersPrompt(folder),
    priorCards: new FilePriorCards(writer),
    ids: parts.ids,
  });
}

// RNF-006
export function composePipeline(parts: PipelineParts): Pipeline {
  const { clock, logger, masker, ids } = parts;
  const s = storesOf(parts);
  const { writer, manifests, runs, projects } = s;
  const log = new JsonlEventLog({ writer, masker });
  const watcher = new RunEndWatcher();
  const lifecycle = new RunLifecycle({
    ...{ runs, manifests, clock, logger },
    sink: new FanOutSink([log, watcher]),
    history: log,
  });
  const pipeline = new SnapshotScanPipeline({ writer, masker, logger, packs: parts.packs });
  const fetcher = parts.fetcher;
  const queue = new RunQueue({
    ...{ runs, lifecycle, clock, logger },
    executors: {
      scan: new RunScan({ fetcher, projects, pipeline, manifests, clock, logger }),
      understand: understandOf(parts, s),
    },
    maxRunning: 1,
  });
  const rosettaVersion = parts.rosettaVersion;
  const submit = new SubmitRun({ runs, manifests, queue, clock, ids, rosettaVersion });
  const keys = s.keys;
  const estimateRun = new EstimateRun({
    projects,
    runs,
    scans: s.scans,
    keys,
    priceTable: parts.priceTable,
  });
  return { ...s, watcher, queue, startRun: new StartRun({ projects, submit }), estimateRun };
}
