import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { WorkbookSnapshotInfo } from '../../../application/ports/source-fetcher.js';
import type { PublishedWorkbooks } from '../../../application/ports/workbook-staging.js';
import type { WorkbookEntry } from '../../../domain/sources/source.js';
import { workbookSnapshotKey } from '../../../domain/sources/workbook-key.js';
import type { SnapshotStore } from '../../github/snapshot-store.js';
import { LimitCounter } from '../entry-guards.js';
import { namedRefusal } from './file-refusal.js';
import type { WorkbookLimits } from './workbook-limits.js';
import type { WorkbookModel } from './workbook-model.js';
import { readWorkbook } from './workbook-reader.js';
import {
  renderWorkbooks,
  WORKBOOK_RENDERER_VERSION,
  type RenderedWorkbook,
} from './workbook-renderer.js';
import {
  entryOf,
  fileHash,
  summaryOf,
  writeRendered,
  type UploadedWorkbook,
} from './workbook-tree.js';

// RF-150, RF-151, RF-152, RFC-005 section 4.2: a finished batch becomes a snapshot. Every workbook
// is read under the limits and rendered, or none is: the first refusal ends the batch, naming its
// file. The rendered tree is written into a partial folder, hashed, described by `snapshot.json`
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
}

/** Reads every workbook of the batch; the cells are counted for the whole project (RF-151). */
async function readAll(input: PublishInput): Promise<WorkbookModel[]> {
  const cells = new LimitCounter(input.limits.maxCells);
  const models: WorkbookModel[] = [];
  for (const upload of input.uploads) {
    input.check();
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
async function entriesOf(
  input: PublishInput,
  rendered: readonly RenderedWorkbook[],
): Promise<WorkbookEntry[]> {
  const entries: WorkbookEntry[] = [];
  for (const [index, upload] of input.uploads.entries()) {
    const book = rendered[index];
    if (book === undefined) continue;
    entries.push(entryOf(upload, await fileHash(upload.path), book.folder, book));
  }
  return entries;
}

/** Renames the partial folder into place, or keeps the snapshot of the same content that is there (RF-152). */
async function publishTree(
  snapshots: SnapshotStore,
  partial: string,
  key: string,
  info: WorkbookSnapshotInfo,
): Promise<void> {
  await snapshots.writeInfo(partial, info);
  if (await snapshots.commit(partial, key)) {
    await snapshots.makeReadOnly(snapshots.snapshotDir(key));
  } else {
    // The same content is already stored: the newest upload names it, as for a zip (RF-128).
    await snapshots.rewriteInfo(key, info);
  }
}

/** Reads, renders and publishes the batch; nothing is left behind when it fails. */
// RF-150, RF-152
export async function publishWorkbooks(
  snapshots: SnapshotStore,
  input: PublishInput,
): Promise<PublishedWorkbooks> {
  const models = await readAll(input);
  input.check();
  const rendered = renderWorkbooks(models);
  input.check();
  const { dir, filesDir } = await snapshots.createPartial(randomUUID());
  try {
    for (const book of rendered) await writeRendered(filesDir, '', book);
    const entries = await entriesOf(input, rendered);
    input.check();
    const tree = await snapshots.inspect(filesDir);
    const info: WorkbookSnapshotInfo = {
      kind: 'workbook',
      uploadedAt: input.uploadedAt,
      rendererVersion: WORKBOOK_RENDERER_VERSION,
      workbooks: entries,
      ...tree,
      skippedLinks: 0,
    };
    const key = workbookSnapshotKey(input.projectId, tree.snapshotHash);
    await publishTree(snapshots, dir, key, info);
    return { key, info, summary: entries.map(summaryOf), skipped: [] };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
