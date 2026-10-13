import type { FastifyInstance } from 'fastify';
import type { DeleteProject } from '../../application/use-cases/delete-project.js';
import type { DeleteRun } from '../../application/use-cases/delete-run.js';
import type { DeleteSnapshot } from '../../application/use-cases/delete-snapshot.js';
import type { ListHistory } from '../../application/use-cases/list-history.js';
import type { ListSnapshots } from '../../application/use-cases/list-snapshots.js';

// RF-1008, RF-1012: stub, replaced by the routes in the next commit.

export interface HistoryServices {
  readonly listHistory: ListHistory;
  readonly deleteRun: DeleteRun;
  readonly deleteProject: DeleteProject;
  readonly listSnapshots: ListSnapshots;
  readonly deleteSnapshot: DeleteSnapshot;
}

export function registerHistoryRoutes(server: FastifyInstance, services: HistoryServices): void {
  void server;
  void services;
}
