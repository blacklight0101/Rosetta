import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnswersFile } from '../application/ports/answers-file.js';
import type { Clock } from '../application/ports/clock.js';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type { Logger } from '../application/ports/logger.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { ProviderSetFactory } from '../application/ports/provider-set-factory.js';
import type { RunIndex } from '../application/ports/run-index.js';
import type { RunManifestStore } from '../application/ports/run-manifest-store.js';
import { RunUnderstand } from '../application/use-cases/run-understand.js';
import { FileCostReportWriter } from '../infrastructure/budget/cost-report-files.js';
import { FileCardOutputs } from '../infrastructure/cards/file-card-outputs.js';
import { PgCostLedger } from '../infrastructure/db/pg-cost-ledger.js';
import { PgCostTotals } from '../infrastructure/db/pg-cost-totals.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import type { OutputWriter } from '../application/ports/output-writer.js';
import { runPath } from '../infrastructure/files/workspace-paths.js';
import { SnapshotStore } from '../infrastructure/github/snapshot-store.js';
import { JsonlEgressLog } from '../infrastructure/guards/jsonl-egress-log.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { loadMergePrompt, loadReaderPrompts } from '../infrastructure/prompts/prompt-files.js';
import { JsonlProviderCallLog } from '../infrastructure/providers/jsonl-provider-call-log.js';
import { loadTextToolProtocol } from '../infrastructure/providers/ollama/text-tool-protocol-file.js';
import { FileScanResults } from '../infrastructure/scan/scan-results.js';

// Architecture section 2 (composition root), RF-200, ADR-003: the executor of the `understand`
// stage. The reader's provider comes only from the provider factory the Test button uses too; the
// code map and snapshot of the project's latest scan are read from the run folder and the snapshot
// cache; the cards, `answers.md` and the cost report are written into the user's workspace. This
// file is at the same depth in `src/` and in the built `dist/`, so `../../` is the repository root.
const promptsFolder = fileURLToPath(new URL('../../prompts/', import.meta.url));

export interface UnderstandParts {
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly masker: TextMasker;
  readonly dataDir: string;
  readonly providers: ProviderSetFactory;
  readonly writer: OutputWriter;
  readonly manifests: RunManifestStore;
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly ids: IdGenerator;
  /** The project's answers.md, shared with the answer routes so writes to one file queue (RF-1007). */
  readonly answers: AnswersFile;
}

/** RF-143: the host of the Ollama address; an address that does not parse names no host. */
export function ollamaHostOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/** RF-200, RF-425: the code map and snapshot of a completed scan, read from the run folder. */
export function composeScanResults(
  parts: Pick<UnderstandParts, 'dataDir' | 'writer' | 'manifests' | 'logger'>,
): FileScanResults {
  const { dataDir, writer, manifests, logger } = parts;
  const snapshots = new SnapshotStore(dataDir);
  return new FileScanResults({
    writer,
    manifests,
    logger,
    snapshotRoot: (key) => snapshots.filesDir(key),
  });
}

// RF-200
export function composeUnderstand(parts: UnderstandParts): RunUnderstand {
  const { pool, logger, clock, masker, dataDir, writer, manifests } = parts;
  return new RunUnderstand({
    ...{ projects: parts.projects, runs: parts.runs, manifests, clock, logger },
    users: new PgUserRepository(pool),
    scans: composeScanResults(parts),
    providers: parts.providers,
    runSinks: (scope) => ({
      recorder: new JsonlProviderCallLog({
        runDir: join(dataDir, 'users', scope.userId, runPath(scope.projectId, scope.runKey)),
        masker,
      }),
      egressLog: new JsonlEgressLog({ writer, masker, scope }),
    }),
    cards: new FileCardOutputs({ writer, masker, logger }),
    answers: parts.answers,
    ledger: new PgCostLedger(pool),
    costTotals: new PgCostTotals(pool),
    costReports: new FileCostReportWriter({ writer, masker }),
    prompts: () => loadReaderPrompts(promptsFolder),
    mergePrompt: () => loadMergePrompt(promptsFolder),
    textToolProtocol: () => loadTextToolProtocol(promptsFolder),
    ids: parts.ids,
  });
}
