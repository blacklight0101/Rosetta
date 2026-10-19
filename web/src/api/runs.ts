import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';
import {
  estimateSchema,
  startedRunSchema,
  stoppedRunSchema,
  type RunEstimate,
  type StartedRun,
} from './estimate-schemas.js';
import { runSchema, type RunRow } from './run-schemas.js';

// RF-425, RF-1001, RF-143, RF-1108: the run calls of the start page. Every answer is parsed before
// use; another user's project or run answers 404 like an unknown one.

export type RunStageChoice = 'scan' | 'understand';

export interface StartRequest {
  readonly stage: RunStageChoice;
  /** `understand` only: the areas to read. */
  readonly areas?: readonly string[];
  /** `understand` only: the consent to send code to the cloud providers the roles use. */
  readonly cloudConsent?: boolean;
  /** `understand` only: the second confirmation for the private code of an upload (RF-132). */
  readonly privateCodeConfirmed?: boolean;
  /** `understand` only: re-run the areas of the answered questions with the answers (RF-241). */
  readonly withAnswers?: boolean;
}

/**
 * The estimate of an understand run: for every area when `areas` is undefined, else for those
 * named, which travel in a POST body so a long selection never meets a URL limit.
 */
// RF-425
export function getEstimate(
  client: ApiClient,
  projectId: string,
  areas: readonly string[] | undefined,
  signal: AbortSignal,
): Promise<ApiResult<RunEstimate>> {
  const path = `/api/projects/${encodeURIComponent(projectId)}/estimate`;
  if (areas === undefined) {
    return client.request({ method: 'GET', path, schema: estimateSchema, signal });
  }
  return client.request({ method: 'POST', path, body: { areas }, schema: estimateSchema, signal });
}

// RF-1001, RF-143
export function startRun(
  client: ApiClient,
  projectId: string,
  request: StartRequest,
): Promise<ApiResult<StartedRun>> {
  return client.request({
    method: 'POST',
    path: `/api/projects/${encodeURIComponent(projectId)}/runs`,
    body: request,
    schema: startedRunSchema,
  });
}

/** Cancels a queued run (RF-1108); `runId` is the `id` the start answered, not its folder name. */
export async function cancelRun(client: ApiClient, runId: string): Promise<ApiResult<undefined>> {
  const result = await client.request({
    method: 'POST',
    path: `/api/runs/${encodeURIComponent(runId)}/stop`,
    schema: stoppedRunSchema,
  });
  return result.ok ? { ok: true, value: undefined } : result;
}

/** Queues a run that stopped at a cap, failed or was interrupted again, as the same run (RF-006). */
// RF-006
export async function resumeRun(client: ApiClient, runId: string): Promise<ApiResult<undefined>> {
  const result = await client.request({
    method: 'POST',
    path: `/api/runs/${encodeURIComponent(runId)}/resume`,
    schema: z.looseObject({ id: z.string() }),
  });
  return result.ok ? { ok: true, value: undefined } : result;
}

/** One run of the signed-in user by its id (the UUID); another user's run answers 404 (RF-1105). */
// RF-1002
export function getRun(
  client: ApiClient,
  runId: string,
  signal: AbortSignal,
): Promise<ApiResult<RunRow>> {
  return client.request({
    method: 'GET',
    path: `/api/runs/${encodeURIComponent(runId)}`,
    schema: runSchema,
    signal,
  });
}

/** The address of a download of a finished run: the whole run folder, or its hand-off folder (RF-008). */
export function runDownloadPath(runId: string, part: 'zip' | 'handoff'): string {
  const file = part === 'zip' ? 'zip' : 'handoff.zip';
  return `/api/runs/${encodeURIComponent(runId)}/${file}`;
}

const reportBuiltSchema = z.object({ files: z.array(z.string()) });

/**
 * Asks for the report of an ended run (DEC-131): the server writes `report/` and lists the files.
 * A run that is queued or running answers 409 `RST-1700`; another user's run answers 404.
 */
// RF-504
export async function buildReport(client: ApiClient, runId: string): Promise<ApiResult<undefined>> {
  const result = await client.request({
    method: 'POST',
    path: `/api/runs/${encodeURIComponent(runId)}/report`,
    schema: reportBuiltSchema,
  });
  return result.ok ? { ok: true, value: undefined } : result;
}

/** The address of a file of the report of a run, served as a page by the run file route (RF-506). */
export function reportFilePath(
  runId: string,
  file: 'report.html' | 'report.md' | 'replay.html',
): string {
  return `/runs/${encodeURIComponent(runId)}/files/report/${file}`;
}
