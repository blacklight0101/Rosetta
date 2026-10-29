import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { WorkbookSnapshotInfo } from '../../../application/ports/source-fetcher.js';
import type {
  LeftOut,
  ProgressListener,
  PublishedWorkbooks,
  WorkbookProgress,
} from '../../../application/ports/workbook-staging.js';
import type { WorkbookEntry } from '../../../domain/sources/source.js';
import { workbookSnapshotKey } from '../../../domain/sources/workbook-key.js';
import type { SnapshotStore } from '../../github/snapshot-store.js';
import { summarizeTree, type HashedFile } from '../../github/tree-summary.js';
import { LimitCounter } from '../entry-guards.js';
import { namedRefusal } from './file-refusal.js';
import type { WorkbookLimits } from './workbook-limits.js';
import type { WorkbookModel } from './workbook-model.js';
import { cellsOf } from './render-steps.js';
import { readWorkbook } from './workbook-reader.js';
import {
  DEFAULT_MAX_TOTAL_BYTES,
  renderProjectAsync,
  WORKBOOK_RENDERER_VERSION,
  type RenderedWorkbook,
} from './workbook-renderer.js';
import {
  entryOf,
  macroLeftOut,
  summaryOf,
  writeRendered,
  type UploadedWorkbook,
} from './workbook-tree.js';

// RF-150, RF-151, RF-152, RFC-005 section 4.2: a finished batch becomes a snapshot. Every workbook
// is read under the limits and rendered, or none is: the first refusal ends the batch, naming its
// file. The rendered tree is written into a partial folder, hashed as it is written, described by `snapshot.json`
// and renamed into place read-only, as the tree of a zip is.

export interface PublishInput {
  readonly uploads: readonly UploadedWorkbook[];
  readonly projectId: string;
  /** ISO 8601 instant in UTC. */
  readonly uploadedAt: string;
  readonly limits: WorkbookLimits;
  readonly signal: AbortSignal;
  /** Throws the reason when the request was stopped or the time bound passed. */
  readonly check: () => void;
  /** Told where reading, rendering and saving have got to (RF-159). */
  readonly onProgress?: ProgressListener;
}

const optional = (onProgress: ProgressListener | undefined): { onProgress?: ProgressListener } =>
  onProgress === undefined ? {} : { onProgress };

/** The last report: everything is read and rendered and the tree is being written. */
function savingOf(models: readonly WorkbookModel[]): WorkbookProgress {
  const sheets = models.reduce((sum, model) => sum + model.sheets.length, 0);
  return {
    ...{ step: 'saving', workbook: models.length, workbooks: models.length },
    ...{ sheet: sheets, sheets, cells: cellsOf(models) },
  };
}

/** Reads every workbook of the batch; the cells are counted for the whole project (RF-151). */
async function readAll(input: PublishInput): Promise<WorkbookModel[]> {
  const cells = new LimitCounter(input.limits.maxCells);
  const models: WorkbookModel[] = [];
  for (const [index, upload] of input.uploads.entries()) {
    input.check();
    const workbook = { workbook: index + 1, workbooks: input.uploads.length };
    input.onProgress?.({
      step: 'reading',
      ...workbook,
      sheet: 0,
      sheets: 0,
      cells: cellsOf(models),
    });
    try {
      const file = { path: upload.path, fileName: upload.fileName };
      models.push(await readWorkbook(file, input.limits, cells, input.signal));
    } catch (error) {
      input.check();
      throw namedRefusal(upload.fileName, error);
    }
  }
  return models;
}

/** The record of each workbook, in the order they were uploaded; the folder is the rendered one. */
function entriesOf(input: PublishInput, rendered: readonly RenderedWorkbook[]): WorkbookEntry[] {
  const entries: WorkbookEntry[] = [];
  for (const [index, upload] of input.uploads.entries()) {
    const book = rendered[index];
    if (book === undefined) continue;
    entries.push(entryOf(upload, upload.sha256, book.folder, book));
  }
  return entries;
}

/** The workbooks to name on the page because their macros were skipped (RF-154). */
function skippedOf(input: PublishInput, rendered: readonly RenderedWorkbook[]): LeftOut[] {
  return rendered.flatMap((book, index) =>
    macroLeftOut(input.uploads[index]?.fileName ?? book.folder, book),
  );
}

/** Renames the partial folder into place, or keeps the snapshot of the same content that is there (RF-152). */
async function publishTree(
  snapshots: SnapshotStore,
  partial: string,
  key: string,
  info: WorkbookSnapshotInfo,
): Promise<boolean> {
  await snapshots.writeInfo(partial, info);
  const created = await snapshots.commit(partial, key);
  // The same content already stored is left as it is; it is named once the upload is kept (RF-159).
  if (created) await snapshots.makeReadOnly(snapshots.snapshotDir(key));
  return created;
}

/** Reads, renders and publishes the batch; nothing is left behind when it fails. */
// RF-150, RF-152
export async function publishWorkbooks(
  snapshots: SnapshotStore,
  input: PublishInput,
): Promise<PublishedWorkbooks> {
  const models = await readAll(input);
  input.check();
  const pacing = { check: input.check, ...optional(input.onProgress) };
  const project = await renderProjectAsync(
    models,
    { maxTotalBytes: DEFAULT_MAX_TOTAL_BYTES },
    pacing,
  );
  const rendered = project.workbooks;
  input.check();
  input.onProgress?.(savingOf(models));
  const { dir, filesDir } = await snapshots.createPartial(randomUUID());
  try {
    // The hashes come from the bytes as they are written; neither the uploads nor the tree are read again (DEC-183).
    const hashed: HashedFile[] = [];
    for (const book of rendered) hashed.push(...(await writeRendered(filesDir, '', book)));
    hashed.push(...(await writeRendered(filesDir, '', { files: [project.dependencies] })));
    const entries = entriesOf(input, rendered);
    input.check();
    const tree = summarizeTree(hashed);
    const info: WorkbookSnapshotInfo = {
      kind: 'workbook',
      uploadedAt: input.uploadedAt,
      rendererVersion: WORKBOOK_RENDERER_VERSION,
      workbooks: entries,
      ...tree,
      skippedLinks: 0,
    };
    const key = workbookSnapshotKey(input.projectId, tree.snapshotHash);
    const created = await publishTree(snapshots, dir, key, info);
    return {
      key,
      created,
      info,
      summary: entries.map(summaryOf),
      skipped: skippedOf(input, rendered),
    };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
