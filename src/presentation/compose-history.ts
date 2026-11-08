import type { Logger } from '../application/ports/logger.js';
import { DeleteProject } from '../application/use-cases/delete-project.js';
import { DeleteRun } from '../application/use-cases/delete-run.js';
import { DeleteSnapshot } from '../application/use-cases/delete-snapshot.js';
import { ListHistory } from '../application/use-cases/list-history.js';
import { ListProjectOverview } from '../application/use-cases/list-project-overview.js';
import { ReadRunPartlyRead } from '../application/use-cases/read-run-partly-read.js';
import { ListSnapshots } from '../application/use-cases/list-snapshots.js';
import { PgCostTotals } from '../infrastructure/db/pg-cost-totals.js';
import { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { FileRunTextFiles } from '../infrastructure/files/file-run-text-files.js';
import { FileSnapshotCache } from '../infrastructure/files/file-snapshot-cache.js';
import { NodeWorkspaceFolders } from '../infrastructure/files/node-workspace-folders.js';
import { FileRunManifestStore } from '../infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { createUploadStore } from './compose-uploads.js';
import type { RunServices } from './web/run-routes.js';
import type { HistoryServices } from './web/history-routes.js';
import type { OpenQuestionCounts } from '../application/journey/open-question-counts.js';

// Architecture section 2 (composition root), RF-1008, RF-1012, RF-1105: the adapters and the use
// cases behind the history page, the deletions, the administrator's snapshot list and the run
// columns of the Projects page.

export interface HistoryParts {
  readonly pool: DatabasePool;
  readonly logger: Logger;
  /** `ROSETTA_DATA_DIR`. */
  readonly dataDir: string;
  /** P8-89: masks the manifests the history reads to tell a Deepen run from another. */
  readonly masker: TextMasker;
  /**
   * P8-130: the run services, whose measures give the share of code read that a State badge names;
   * P8-139: the one store of the open questions, which a run deletion refreshes.
   */
  readonly runs: {
    readonly services: Pick<RunServices, 'readUnderstanding'>;
    readonly questionCounts: Pick<OpenQuestionCounts, 'refresh'>;
  };
}

// RF-1012
export function composeHistory(parts: HistoryParts): HistoryServices {
  const { pool, logger, dataDir, masker } = parts;
  const projects = new PgProjectRepository(pool);
  const runs = new PgRunIndex(pool);
  const folders = new NodeWorkspaceFolders(dataDir);
  const snapshots = new FileSnapshotCache(dataDir);
  const writer = new NodeOutputWriter({ dataDir, logger });
  const manifests = new FileRunManifestStore({ writer, masker });
  const partlyRead = new ReadRunPartlyRead({
    files: new FileRunTextFiles(writer),
    logger,
    understanding: parts.runs.services.readUnderstanding,
  });
  return {
    listHistory: new ListHistory({ projects, runs, folders, manifests, logger, partlyRead }),
    listProjectOverview: new ListProjectOverview({ projects, runs, costs: new PgCostTotals(pool) }),
    deleteRun: new DeleteRun({
      ...{ runs, folders, logger },
      counts: parts.runs.questionCounts,
    }),
    deleteProject: new DeleteProject({
      ...{ projects, runs, folders, logger },
      uploads: createUploadStore(dataDir),
    }),
    listSnapshots: new ListSnapshots({ snapshots, runs }),
    deleteSnapshot: new DeleteSnapshot({ snapshots, runs, logger }),
  };
}
