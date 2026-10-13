import type { Logger } from '../application/ports/logger.js';
import { DeleteProject } from '../application/use-cases/delete-project.js';
import { DeleteRun } from '../application/use-cases/delete-run.js';
import { DeleteSnapshot } from '../application/use-cases/delete-snapshot.js';
import { ListHistory } from '../application/use-cases/list-history.js';
import { ListSnapshots } from '../application/use-cases/list-snapshots.js';
import { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { FileSnapshotCache } from '../infrastructure/files/file-snapshot-cache.js';
import { NodeWorkspaceFolders } from '../infrastructure/files/node-workspace-folders.js';
import type { HistoryServices } from './web/history-routes.js';

// Architecture section 2 (composition root), RF-1008, RF-1012, RF-1105: the adapters and the use
// cases behind the history page, the deletions and the administrator's snapshot list.

export interface HistoryParts {
  readonly pool: DatabasePool;
  readonly logger: Logger;
  /** `ROSETTA_DATA_DIR`. */
  readonly dataDir: string;
}

// RF-1012
export function composeHistory(parts: HistoryParts): HistoryServices {
  const { pool, logger, dataDir } = parts;
  const projects = new PgProjectRepository(pool);
  const runs = new PgRunIndex(pool);
  const folders = new NodeWorkspaceFolders(dataDir);
  const snapshots = new FileSnapshotCache(dataDir);
  return {
    listHistory: new ListHistory({ projects, runs, folders }),
    deleteRun: new DeleteRun({ runs, folders, logger }),
    deleteProject: new DeleteProject({ projects, runs, folders, logger }),
    listSnapshots: new ListSnapshots({ snapshots, runs }),
    deleteSnapshot: new DeleteSnapshot({ snapshots, runs, logger }),
  };
}
