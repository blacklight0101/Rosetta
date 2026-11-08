import type { UploadStore } from '../../src/application/ports/upload-store.js';
import { DeleteProject } from '../../src/application/use-cases/delete-project.js';
import { DeleteRun } from '../../src/application/use-cases/delete-run.js';
import { DeleteSnapshot } from '../../src/application/use-cases/delete-snapshot.js';
import { ListHistory } from '../../src/application/use-cases/list-history.js';
import { ListProjectOverview } from '../../src/application/use-cases/list-project-overview.js';
import { ListSnapshots } from '../../src/application/use-cases/list-snapshots.js';
import type { ServerOptions } from '../../src/presentation/web/server.js';
import type { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import type { MemoryLogger } from './memory-logger.js';
import type { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import type { MemorySnapshotCache } from './memory-snapshot-cache.js';
import type { MemoryWorkspaceFolders } from './memory-workspace-folders.js';
import { noPartlyRead, type PartlyReadReader } from './partly-read-doubles.js';
import type { RunHarness } from './run-harness.js';
import { noQuestionCounts } from './recording-journey-facts.js';

/** RF-1008, RF-1012: the history, deletion, snapshot and Projects page run use cases over the harness's memory adapters. */
export function historyServices(parts: {
  readonly runs: RunHarness;
  readonly projects: MemoryProjectRepository;
  readonly folders: MemoryWorkspaceFolders;
  readonly snapshots: MemorySnapshotCache;
  readonly logger: MemoryLogger;
  readonly costs: MemoryCostTotals;
  /** RF-133: the store whose snapshots a deleted project takes with it. */
  readonly upload: { readonly store: UploadStore };
  /** P8-130: `partlyRead` is what the history reads of each run's coverage. */
  readonly options: { readonly partlyRead?: PartlyReadReader | undefined };
}): ServerOptions['history'] {
  const { projects, folders, snapshots, logger, costs, upload } = parts;
  const { partlyRead = noPartlyRead } = parts.options;
  const { runs, manifests } = parts.runs;
  return {
    listHistory: new ListHistory({ ...{ projects, runs, folders, logger, manifests, partlyRead } }),
    listProjectOverview: new ListProjectOverview({ projects, runs, costs }),
    deleteRun: new DeleteRun({ runs, folders, logger, counts: noQuestionCounts }),
    deleteProject: new DeleteProject({
      ...{ projects, runs, folders, logger },
      uploads: upload.store,
    }),
    listSnapshots: new ListSnapshots({ snapshots, runs }),
    deleteSnapshot: new DeleteSnapshot({ snapshots, runs, logger }),
  };
}
