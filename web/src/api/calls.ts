import type { ApiClient, ApiResult } from './client.js';
import {
  callsSchema,
  logsSchema,
  transcriptSchema,
  type RunCalls,
  type RunLogs,
  type TranscriptRow,
} from './call-schemas.js';

// RF-1011: the reads of the "API calls" and "Logs" panels. Another user's run answers 404 like an
// unknown one (RF-1105).

const runPath = (runId: string): string => `/api/runs/${encodeURIComponent(runId)}`;

/** P5-22: calls per page. */
const CALLS_PAGE = 100;

/** One page of the calls, the first when no cursor is given. */
// RF-1011
export function getRunCalls(
  client: ApiClient,
  runId: string,
  cursor: string | undefined,
  signal: AbortSignal,
): Promise<ApiResult<RunCalls>> {
  const after = cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`;
  return client.request({
    method: 'GET',
    path: `${runPath(runId)}/calls?limit=${String(CALLS_PAGE)}${after}`,
    schema: callsSchema,
    signal,
  });
}

// RF-1011
export function getRunLogs(
  client: ApiClient,
  runId: string,
  signal: AbortSignal,
): Promise<ApiResult<RunLogs>> {
  return client.request({
    method: 'GET',
    path: `${runPath(runId)}/logs`,
    schema: logsSchema,
    signal,
  });
}

/** The masked messages one call added to its agent task's transcript. */
// RF-1011
export function getCallTranscript(
  client: ApiClient,
  runId: string,
  seq: number,
  signal: AbortSignal,
): Promise<ApiResult<readonly TranscriptRow[]>> {
  return client.request({
    method: 'GET',
    path: `${runPath(runId)}/calls/${String(seq)}/transcript`,
    schema: transcriptSchema,
    signal,
  });
}
