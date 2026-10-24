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
import { FilePriorCards } from '../infrastructure/cards/prior-cards.js';
import { FileCardOutputs } from '../infrastructure/cards/file-card-outputs.js';
import { FileTaskResults } from '../infrastructure/cards/file-task-results.js';
import { PgCostLedger } from '../infrastructure/db/pg-cost-ledger.js';
import { PgCostTotals } from '../infrastructure/db/pg-cost-totals.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import type { OutputWriter } from '../application/ports/output-writer.js';
import { runPath } from '../infrastructure/files/workspace-paths.js';
import { SnapshotStore } from '../infrastructure/github/snapshot-store.js';
import { JsonlEgressLog } from '../infrastructure/guards/jsonl-egress-log.js';
import { MaskedLineFinder } from '../infrastructure/guards/masked-line-finder.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import {
  loadAnswersPrompt,
  loadParentCardsPrompt,
  loadRereadPrompt,
  loadMergePrompt,
  loadOverviewPrompt,
  loadReaderPrompts,
} from '../infrastructure/prompts/prompt-files.js';
import { loadMaskedValuePrompt } from '../infrastructure/prompts/masked-value-prompt.js';
import { loadVerifierPrompts } from '../infrastructure/prompts/verifier-prompt-files.js';
import { JsonlProviderCallLog } from '../infrastructure/providers/jsonl-provider-call-log.js';
import { loadTextToolProtocol } from '../infrastructure/providers/ollama/text-tool-protocol-file.js';
import type { LanguagePackRegistry } from '../infrastructure/scan/packs/pack-registry.js';
import { FileScanResults } from '../infrastructure/scan/scan-results.js';
import { RosettaError } from '../domain/errors/rosetta-error.js';
import { isUploadSnapshotKey } from '../domain/sources/upload-name.js';
import { workbookFoldersOf } from '../domain/sources/workbook-folders.js';
import { isWorkbookSnapshotKey } from '../domain/sources/workbook-key.js';

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
  parts: Pick<UnderstandParts, 'dataDir' | 'writer' | 'manifests' | 'logger'> & {
    /** P5-31: the language packs, which read the markup of the pages a screen card cites. */
    readonly packs?: LanguagePackRegistry;
  },
): FileScanResults {
  const { dataDir, writer, manifests, logger, packs } = parts;
  const snapshots = new SnapshotStore(dataDir);
  return new FileScanResults({
    ...(packs === undefined ? {} : { packs }),
    writer,
    manifests,
    logger,
    snapshotRoot: (key) => snapshots.filesDir(key),
    // RF-155: the folders of the rendered workbooks the snapshot record lists.
    workbookFolders: async (key) => {
      // A GitHub snapshot lists none, and its record is not read for this.
      if (!isUploadSnapshotKey(key) && !isWorkbookSnapshotKey(key)) return [];
      try {
        const snapshot = await snapshots.readExisting(key);
        return snapshot === undefined ? [] : workbookFoldersOf(snapshot);
      } catch (error) {
        // A record that cannot be read costs the guidance, never the run (main never read it).
        await logger.log({
          ...{ level: 'warn', logger: 'understand' },
          ...(error instanceof RosettaError ? { code: error.code } : {}),
          message:
            'The snapshot.json of the source could not be read, so no workbook guidance is added.',
        });
        return [];
      }
    },
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
    taskResults: new FileTaskResults({ writer, masker }),
    answers: parts.answers,
    ledger: new PgCostLedger(pool),
    costTotals: new PgCostTotals(pool),
    costReports: new FileCostReportWriter({ writer, masker }),
    prompts: () => loadReaderPrompts(promptsFolder),
    mergePrompt: () => loadMergePrompt(promptsFolder),
    overviewPrompt: () => loadOverviewPrompt(promptsFolder),
    verifierPrompts: () => loadVerifierPrompts(promptsFolder),
    maskedValuePrompt: () => loadMaskedValuePrompt(promptsFolder),
    secretLines: new MaskedLineFinder(masker),
    textToolProtocol: () => loadTextToolProtocol(promptsFolder),
    answersPrompt: () => loadAnswersPrompt(promptsFolder),
    rereadPrompt: () => loadRereadPrompt(promptsFolder),
    parentCardsPrompt: () => loadParentCardsPrompt(promptsFolder),
    priorCards: new FilePriorCards(writer),
    ids: parts.ids,
  });
}
