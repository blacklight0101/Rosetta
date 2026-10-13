import type { ApiClient, ApiResult } from './client.js';
import {
  deletedSchema,
  runHistorySchema,
  snapshotListSchema,
  type Deleted,
  type RunHistory,
  type Snapshot,
} from './history-schemas.js';

// RF-1008, RF-1012, RF-1105: the history and deletion calls. Another user's project or run answers
// 404 like an unknown one; a run, project or snapshot in progress answers 409 (RST-2306).

// RF-1008
export function getHistory(
  client: ApiClient,
  projectId: string,
  signal: AbortSignal,
): Promise<ApiResult<RunHistory>> {
  return client.request({
    method: 'GET',
    path: `/api/projects/${encodeURIComponent(projectId)}/history`,
    schema: runHistorySchema,
    signal,
  });
}

// RF-1012
export function deleteRun(client: ApiClient, runId: string): Promise<ApiResult<Deleted>> {
  return client.request({
    method: 'DELETE',
    path: `/api/runs/${encodeURIComponent(runId)}`,
    schema: deletedSchema,
  });
}

// RF-1012
export function deleteProject(client: ApiClient, projectId: string): Promise<ApiResult<Deleted>> {
  return client.request({
    method: 'DELETE',
    path: `/api/projects/${encodeURIComponent(projectId)}`,
    schema: deletedSchema,
  });
}

// RF-1012
export async function listSnapshots(
  client: ApiClient,
  signal: AbortSignal,
): Promise<ApiResult<readonly Snapshot[]>> {
  const result = await client.request({
    method: 'GET',
    path: '/api/admin/snapshots',
    schema: snapshotListSchema,
    signal,
  });
  return result.ok ? { ok: true, value: result.value.snapshots } : result;
}

// RF-1012
export function deleteSnapshot(client: ApiClient, key: string): Promise<ApiResult<Deleted>> {
  return client.request({
    method: 'DELETE',
    path: `/api/admin/snapshots/${encodeURIComponent(key)}`,
    schema: deletedSchema,
  });
}
