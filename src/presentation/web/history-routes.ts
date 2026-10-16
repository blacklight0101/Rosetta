import type { FastifyInstance } from 'fastify';
import type { DeleteProject } from '../../application/use-cases/delete-project.js';
import type { DeleteRun } from '../../application/use-cases/delete-run.js';
import type { DeleteSnapshot } from '../../application/use-cases/delete-snapshot.js';
import type {
  HistoryRun,
  ListHistory,
  RunHistory,
} from '../../application/use-cases/list-history.js';
import type { ListedSnapshot, ListSnapshots } from '../../application/use-cases/list-snapshots.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { formatInstant } from '../../infrastructure/system/instant.js';
import {
  registerProjectOverviewRoutes,
  type ProjectOverviewServices,
} from './project-overview-routes.js';
import { signedInOf } from './request-actor.js';

// RF-1008, RF-1012, RF-1105, RF-1102: the history and deletion API.
// - GET /api/projects/:id/history lists the runs of the signed-in user's project, newest first, with
//   their commit, stage, state, totals and the size of each folder, and the project folder (name and
//   size) a deletion would free. The owner's id and the snapshot folder never leave the server.
// - DELETE /api/runs/:runId and DELETE /api/projects/:id remove what has ended (200 with the bytes
//   freed); a run or project in progress answers 409 (RST-2306). Another user's id answers 404 like
//   an unknown one. The cost ledger is never touched (DEC-55).
// - GET /api/admin/snapshots and DELETE /api/admin/snapshots/:key (administrator) list and remove
//   the downloaded snapshots; one that a run in progress uses answers 409.
// - GET /api/projects/overview: the run columns of the Projects page (project-overview-routes.ts).

export interface HistoryServices extends ProjectOverviewServices {
  readonly listHistory: ListHistory;
  readonly deleteRun: DeleteRun;
  readonly deleteProject: DeleteProject;
  readonly listSnapshots: ListSnapshots;
  readonly deleteSnapshot: DeleteSnapshot;
}

function instantOrNull(value: number | null): string | null {
  return value === null ? null : formatInstant(value);
}

function runRow({ run, sizeBytes }: HistoryRun): Record<string, unknown> {
  return {
    id: run.id,
    runId: run.runKey,
    stage: run.stage,
    queueState: run.queueState,
    endState: run.endState,
    commitSha: run.commitSha,
    queuedAt: formatInstant(run.queuedAt),
    startedAt: instantOrNull(run.startedAt),
    endedAt: instantOrNull(run.endedAt),
    totals: run.totals,
    failedAreas: run.failedAreas,
    sizeBytes,
  };
}

function historyView({ project, runs, sizeBytes }: RunHistory): Record<string, unknown> {
  return {
    project: {
      id: project.id,
      name: project.name,
      sourceUrl: project.sourceUrl,
      ref: project.ref,
      subpath: project.subpath,
      folder: `projects/${project.id}`,
      sizeBytes,
    },
    runs: runs.map(runRow),
  };
}

function snapshotRow({ snapshot, runs, activeRuns, lastUsedAt }: ListedSnapshot) {
  return {
    key: snapshot.key,
    repository: snapshot.repository,
    commitSha: snapshot.commitSha,
    downloadedAt: snapshot.downloadedAt,
    fileCount: snapshot.fileCount,
    sizeBytes: snapshot.totalBytes,
    runs,
    activeRuns,
    lastUsedAt: instantOrNull(lastUsedAt),
  };
}

function registerHistory(server: FastifyInstance, services: HistoryServices): void {
  server.get<{ Params: { id: string } }>(
    '/api/projects/:id/history',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.listHistory.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(200).send(historyView(outcome.value));
    },
  );
}

function registerDeletions(server: FastifyInstance, services: HistoryServices): void {
  server.delete<{ Params: { runId: string } }>(
    '/api/runs/:runId',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.deleteRun.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(200).send(outcome.value);
    },
  );
  server.delete<{ Params: { id: string } }>(
    '/api/projects/:id',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.deleteProject.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(200).send(outcome.value);
    },
  );
}

function registerSnapshots(server: FastifyInstance, services: HistoryServices): void {
  server.get('/api/admin/snapshots', { config: { access: 'admin' } }, async (request, reply) => {
    const outcome = await services.listSnapshots.execute({ actor: signedInOf(request).actor });
    if (!outcome.ok) throw new RosettaError(outcome.error);
    return reply.status(200).send({ snapshots: outcome.value.map(snapshotRow) });
  });
  server.delete<{ Params: { key: string } }>(
    '/api/admin/snapshots/:key',
    { config: { access: 'admin' } },
    async (request, reply) => {
      const outcome = await services.deleteSnapshot.execute({
        actor: signedInOf(request).actor,
        key: request.params.key,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(200).send(outcome.value);
    },
  );
}

// RF-1008, RF-1012, RF-1105
export function registerHistoryRoutes(server: FastifyInstance, services: HistoryServices): void {
  registerHistory(server, services);
  registerDeletions(server, services);
  registerSnapshots(server, services);
  registerProjectOverviewRoutes(server, services);
}
