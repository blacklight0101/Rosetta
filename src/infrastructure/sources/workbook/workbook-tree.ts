import { createHash } from 'node:crypto';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { WorkbookSummaryLine } from '../../../application/ports/workbook-staging.js';
import type { WorkbookEntry } from '../../../domain/sources/source.js';
import { snapshotWriteFailed } from '../../github/snapshot-errors.js';
import type { RenderedWorkbook } from './workbook-renderer.js';

// RF-152, RF-150: the rendered text of a workbook written into a snapshot tree, and the record the
// snapshot keeps of it. The renderer returns paths and texts; this is where they reach the disk.

/** The workbook as it was uploaded, before it is deleted. */
export interface UploadedWorkbook {
  readonly fileName: string;
  readonly path: string;
  readonly size: number;
}

const READ_CHUNK_BYTES = 64 * 1024;

/** `sha256:` and 64 lower-case hexadecimal characters of a file, read in chunks. */
export async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  const handle = await open(path);
  try {
    const buffer = Buffer.alloc(READ_CHUNK_BYTES);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return `sha256:${hash.digest('hex')}`;
}

/** Writes the files of a rendered workbook below `root`; `prefix` is the folder it goes in. */
export async function writeRendered(
  root: string,
  prefix: string,
  rendered: RenderedWorkbook,
): Promise<void> {
  try {
    for (const file of rendered.files) {
      const target = join(root, prefix, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, { encoding: 'utf8', flag: 'wx' });
    }
  } catch (error) {
    throw snapshotWriteFailed('rendered workbook could not be written', error);
  }
}

/** The record of one workbook in `snapshot.json`: where it was rendered and what it holds. */
export function entryOf(
  upload: UploadedWorkbook,
  sha256: string,
  folder: string,
  rendered: RenderedWorkbook,
): WorkbookEntry {
  const { sheets, nonEmptyCells, formulas } = rendered.counts;
  return {
    fileName: upload.fileName,
    folder,
    sizeBytes: upload.size,
    sha256,
    counts: { sheets, nonEmptyCells, formulas, macroModules: 0, macrosSkipped: 0 },
  };
}

/** What the page shows of one workbook (RF-150). */
export function summaryOf(entry: WorkbookEntry): WorkbookSummaryLine {
  const { sheets, nonEmptyCells, formulas, macroModules } = entry.counts;
  return { name: entry.fileName, sheets, cells: nonEmptyCells, formulas, macroModules };
}
