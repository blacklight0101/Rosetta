import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';
import { projectSchema, type Project } from './project-schemas.js';
import { sessionSchema } from './schemas.js';

// RF-128, RF-129, RF-134, RFC-004 section 4.2: the calls of the Upload a zip tab. The project is
// created first (`POST /api/projects` with `sourceKind: 'upload'` and a name), then the archive goes
// to `PUT /api/projects/:id/source` as `application/zip`; the answer (201) says what was kept.

/** DEC-149: the local limit, used until the server reports its own. */
export const defaultUploadLimitMb = 500;

export const uploadSummarySchema = z.object({
  /** Files kept in the snapshot. */
  files: z.number().int().nonnegative(),
  /** Bytes of the files kept. */
  size: z.number().int().nonnegative(),
  /** Entries left out: links, deny-listed or ignored folders (RF-122, RF-129). */
  skipped: z.number().int().nonnegative(),
  snapshotHash: z.string(),
  /** What the server stored (P3-38); absent until it says, then the page uses its own. */
  fileName: z.string().optional(),
  uploadedAt: z.string().optional(),
  /** The newest run read other code than this zip; absent from an older server, then the page keeps its notice. */
  codeChangedSinceLastRun: z.boolean().optional(),
});

export type UploadSummary = z.output<typeof uploadSummarySchema>;

// RF-128
export function createUploadProject(client: ApiClient, name: string): Promise<ApiResult<Project>> {
  return client.request({
    method: 'POST',
    path: '/api/projects',
    body: { sourceKind: 'upload', name },
    schema: projectSchema,
  });
}

/** Who follows an upload: its progress, and the signal that cancels it. */
interface UploadWatch {
  readonly onProgress: (loaded: number, total: number) => void;
  readonly signal?: AbortSignal;
}

// RF-128
export function uploadSource(
  client: ApiClient,
  projectId: string,
  file: File,
  watch: UploadWatch,
): Promise<ApiResult<UploadSummary>> {
  return client.upload({
    path: `/api/projects/${encodeURIComponent(projectId)}/source`,
    file,
    contentType: 'application/zip',
    // The server names the snapshot after the file, not after the project (RF-128).
    headers: { 'x-file-name': encodeURIComponent(file.name) },
    schema: uploadSummarySchema,
    onProgress: watch.onProgress,
    ...(watch.signal === undefined ? {} : { signal: watch.signal }),
  });
}

/** The largest zip, in MB, as `GET /api/session` reports it; the default when it does not (RF-129). */
// RF-129
export async function loadUploadLimitMb(client: ApiClient, signal: AbortSignal): Promise<number> {
  const result = await client.request({
    method: 'GET',
    path: '/api/session',
    schema: sessionSchema,
    signal,
  });
  return result.ok ? (result.value.uploadMaxMb ?? defaultUploadLimitMb) : defaultUploadLimitMb;
}
