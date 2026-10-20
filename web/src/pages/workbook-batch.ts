import type { ApiClient, ApiResult } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import {
  cancelBatch,
  createWorkbookProject,
  finishBatch,
  openBatch,
  sendWorkbook,
  type WorkbookSummary,
} from '../api/workbook-upload.js';

// RF-150, RFC-005 section 4.2: one run of the Excel workbooks upload. It makes the project (unless
// there is one), opens a batch (unless the one a failed run left open still fits the files), sends
// the files one per request, and finishes the batch. A file that failed can be sent again alone,
// so an open batch is kept for the next run; a finished batch, good or refused, is spent.

/** A batch the server holds open, and the files it already has. */
export interface OpenBatch {
  readonly id: string;
  readonly sent: readonly File[];
}

export type FileState = 'waiting' | 'sending' | 'sent' | 'failed' | 'unsent';

/** What a run tells the page as it goes. */
export interface BatchEvents {
  readonly project: (project: Project) => void;
  readonly batch: (batch: OpenBatch | undefined) => void;
  readonly file: (index: number, state: FileState) => void;
  readonly progress: (index: number, percent: number) => void;
  readonly finishing: () => void;
}

export interface BatchRun {
  readonly client: ApiClient;
  readonly signal: AbortSignal;
  readonly name: string;
  readonly files: readonly File[];
  readonly project: Project | undefined;
  readonly batch: OpenBatch | undefined;
  readonly events: BatchEvents;
}

/** The open batch is used again only when every file it holds is still among the files chosen. */
function reusable(batch: OpenBatch | undefined, files: readonly File[]): OpenBatch | undefined {
  return batch?.sent.every((file) => files.includes(file)) === true ? batch : undefined;
}

async function sendFiles(
  run: BatchRun,
  projectId: string,
  start: OpenBatch,
): Promise<ApiResult<OpenBatch>> {
  let batch = start;
  for (const [index, file] of run.files.entries()) {
    if (batch.sent.includes(file)) {
      run.events.file(index, 'sent');
      continue;
    }
    run.events.file(index, 'sending');
    const stored = await sendWorkbook(run.client, { projectId, batchId: batch.id }, file, {
      onProgress: (loaded, total) => {
        run.events.progress(index, Math.floor((loaded * 100) / total));
      },
      signal: run.signal,
    });
    if (!stored.ok) {
      run.events.file(index, 'failed');
      // The server no longer has the batch (it expired): the next run opens a new one.
      if (stored.error.status === 404) run.events.batch(undefined);
      return stored;
    }
    batch = { ...batch, sent: [...batch.sent, file] };
    run.events.batch(batch);
    run.events.file(index, 'sent');
  }
  return { ok: true, value: batch };
}

async function ensureBatch(run: BatchRun, projectId: string): Promise<ApiResult<OpenBatch>> {
  const kept = reusable(run.batch, run.files);
  if (kept !== undefined) return { ok: true, value: kept };
  // An open batch the files do not fit is cancelled, or it would block the new one (RST-1919).
  if (run.batch !== undefined) await cancelBatch(run.client, { projectId, batchId: run.batch.id });
  const opened = await openBatch(run.client, projectId, run.signal);
  if (!opened.ok) return opened;
  const batch = { id: opened.value, sent: [] };
  run.events.batch(batch);
  return { ok: true, value: batch };
}

async function ensureProject(run: BatchRun): Promise<ApiResult<Project>> {
  if (run.project !== undefined) return { ok: true, value: run.project };
  const created = await createWorkbookProject(run.client, run.name);
  if (created.ok) run.events.project(created.value);
  return created;
}

// RF-150
export async function runBatch(run: BatchRun): Promise<ApiResult<WorkbookSummary>> {
  const project = await ensureProject(run);
  if (!project.ok) return project;
  const opened = await ensureBatch(run, project.value.id);
  if (!opened.ok) return opened;
  const sent = await sendFiles(run, project.value.id, opened.value);
  if (!sent.ok) return sent;
  run.events.finishing();
  const finished = await finishBatch(
    run.client,
    { projectId: project.value.id, batchId: sent.value.id },
    run.signal,
  );
  run.events.batch(undefined);
  if (!finished.ok) {
    // Nothing is published: no file counts as stored any more.
    run.files.forEach((_, index) => {
      run.events.file(index, 'unsent');
    });
  }
  return finished;
}
