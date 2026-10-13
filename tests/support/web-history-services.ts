import { DeleteProject } from '../../src/application/use-cases/delete-project.js';
import { DeleteRun } from '../../src/application/use-cases/delete-run.js';
import { DeleteSnapshot } from '../../src/application/use-cases/delete-snapshot.js';
import { ListHistory } from '../../src/application/use-cases/list-history.js';
import { ListSnapshots } from '../../src/application/use-cases/list-snapshots.js';
import type { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import type { ServerOptions } from '../../src/presentation/web/server.js';
import type { MemoryLogger } from './memory-logger.js';
import type { MemorySnapshotCache } from './memory-snapshot-cache.js';
import type { MemoryWorkspaceFolders } from './memory-workspace-folders.js';
import type { RunHarness } from './run-harness.js';

/** RF-1008, RF-1012: the history, deletion and snapshot use cases over the harness's memory adapters. */
export function historyServices(parts: {
  readonly runs: RunHarness;
  readonly projects: MemoryProjectRepository;
  readonly folders: MemoryWorkspaceFolders;
  readonly snapshots: MemorySnapshotCache;
  readonly logger: MemoryLogger;
}): ServerOptions['history'] {
  const { projects, folders, snapshots, logger } = parts;
  const runs = parts.runs.runs;
  return {
    listHistory: new ListHistory({ projects, runs, folders }),
    deleteRun: new DeleteRun({ runs, folders, logger }),
    deleteProject: new DeleteProject({ projects, runs, folders, logger }),
    listSnapshots: new ListSnapshots({ snapshots, runs }),
    deleteSnapshot: new DeleteSnapshot({ snapshots, runs, logger }),
  };
}
