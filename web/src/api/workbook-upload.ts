import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';
import { projectSchema, type Project } from './project-schemas.js';
import { sessionSchema } from './schemas.js';

// RF-150, RF-158, RFC-005 section 4.2: the calls of the Excel workbooks tab. The project is created
// first (`POST /api/projects` with `sourceKind: 'workbook'` and a name); a batch is opened
// (`POST /api/projects/:id/source/batches`); each workbook goes in its own request (`PUT .../files`,
// raw body, `X-File-Name`); the batch is finished (`POST .../finish`), which reads, renders and
// publishes every workbook or none.

/** Q-32: the most workbooks in one project until the server reports its own (`GET /api/session`). */
export const defaultWorkbookMaxFiles = 20;

/** The most workbooks in one project, as `GET /api/session` reports it; the default when it does not. */
// RF-151
export async function loadWorkbookMaxFiles(
  client: ApiClient,
  signal: AbortSignal,
): Promise<number> {
  const result = await client.request({
    method: 'GET',
    path: '/api/session',
    schema: sessionSchema,
    signal,
  });
  return result.ok
    ? (result.value.workbookMaxFiles ?? defaultWorkbookMaxFiles)
    : defaultWorkbookMaxFiles;
}

/** Cancels an open batch so the next one can be opened at once (RST-1919); a failure is not worth telling. */
// RF-150
export async function cancelBatch(
  client: ApiClient,
  batch: { readonly projectId: string; readonly batchId: string },
): Promise<void> {
  await client.request({
    method: 'DELETE',
    path: `${batchPath(batch.projectId)}/${encodeURIComponent(batch.batchId)}`,
    schema: z.undefined(),
  });
}

/** Reading and rendering a set of workbooks can take minutes; a batch lives 30 minutes. */
const finishTimeoutMs = 10 * 60_000;

const batchSchema = z.object({ batchId: z.string().min(1) });

const fileStoredSchema = z.object({ name: z.string(), size: z.number().int().nonnegative() });

const count = z.number().int().nonnegative();

const workbookSummarySchema = z.object({
  /** What was read of each workbook (RF-150). */
  workbooks: z.array(
    z.object({
      name: z.string(),
      sheets: count,
      cells: count,
      formulas: count,
      macroModules: count,
    }),
  ),
  /** Items left out, each with its reason (RF-150, Q-41). */
  skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
  snapshotHash: z.string(),
  uploadedAt: z.string().optional(),
  /** The newest run read other code than this batch; absent from an older server, then the page keeps its notice. */
  codeChangedSinceLastRun: z.boolean().optional(),
});

export type WorkbookSummary = z.output<typeof workbookSummarySchema>;

/** Who follows a file on its way: its progress, and the signal that cancels it. */
interface FileWatch {
  readonly onProgress: (loaded: number, total: number) => void;
  readonly signal: AbortSignal;
}

const batchPath = (projectId: string): string =>
  `/api/projects/${encodeURIComponent(projectId)}/source/batches`;

// RF-150
export function createWorkbookProject(
  client: ApiClient,
  name: string,
): Promise<ApiResult<Project>> {
  return client.request({
    method: 'POST',
    path: '/api/projects',
    body: { sourceKind: 'workbook', name },
    schema: projectSchema,
  });
}

// RF-150
export async function openBatch(
  client: ApiClient,
  projectId: string,
  signal: AbortSignal,
): Promise<ApiResult<string>> {
  const opened = await client.request({
    method: 'POST',
    path: batchPath(projectId),
    schema: batchSchema,
    signal,
  });
  return opened.ok ? { ok: true, value: opened.value.batchId } : opened;
}

// RF-150
export function sendWorkbook(
  client: ApiClient,
  batch: { readonly projectId: string; readonly batchId: string },
  file: File,
  watch: FileWatch,
): Promise<ApiResult<z.output<typeof fileStoredSchema>>> {
  return client.upload({
    path: `${batchPath(batch.projectId)}/${encodeURIComponent(batch.batchId)}/files`,
    file,
    contentType: 'application/octet-stream',
    // The server names the workbook after the file (RFC-005 section 4.2).
    headers: { 'x-file-name': encodeURIComponent(file.name) },
    schema: fileStoredSchema,
    onProgress: watch.onProgress,
    signal: watch.signal,
  });
}

// RF-150
export function finishBatch(
  client: ApiClient,
  batch: { readonly projectId: string; readonly batchId: string },
  signal: AbortSignal,
): Promise<ApiResult<WorkbookSummary>> {
  return client.request({
    method: 'POST',
    path: `${batchPath(batch.projectId)}/${encodeURIComponent(batch.batchId)}/finish`,
    schema: workbookSummarySchema,
    timeoutMs: finishTimeoutMs,
    signal,
  });
}
