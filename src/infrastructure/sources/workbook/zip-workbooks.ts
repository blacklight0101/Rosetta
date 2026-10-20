import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { LeftOut, WorkbookSummaryLine } from '../../../application/ports/workbook-staging.js';
import { describeError } from '../../../domain/errors/descriptions.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import type { WorkbookEntry } from '../../../domain/sources/source.js';
import { LimitCounter } from '../entry-guards.js';
import { workbookTooManyFiles } from './workbook-errors.js';
import type { WorkbookLimits } from './workbook-limits.js';
import { readWorkbook } from './workbook-reader.js';
import {
  DEFAULT_MAX_TOTAL_BYTES,
  renderWorkbook,
  type RenderedWorkbook,
} from './workbook-renderer.js';
import { entryOf, fileHash, summaryOf, writeRendered } from './workbook-tree.js';

// RF-152, RF-150, Q-41, DEC-150: the workbooks inside an unpacked zip. Each `.xlsx` or `.xlsm` is read
// under the workbook limits and replaced, in the same place, by the folder it renders to; one that
// cannot be rendered (legacy format, password, a limit) is deleted and listed with its reason, and
// the rest of the zip is kept. The cells and the rendered text are counted for the whole zip.

export interface ZipWorkbooks {
  readonly entries: readonly WorkbookEntry[];
  readonly lines: readonly WorkbookSummaryLine[];
  readonly leftOut: readonly LeftOut[];
}

const WORKBOOK_EXTENSIONS = ['.xlsx', '.xlsm', '.xls', '.xlsb'];
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The relative paths (with `/`) of the workbook files of the tree, in code-unit order. */
async function workbookPaths(root: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (!entry.isFile() || !WORKBOOK_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;
    found.push(relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'));
  }
  return found.sort(byCodeUnit);
}

/** The reason shown for a workbook that was left out: the code and its plain message. */
function reasonOf(error: RosettaError): string {
  return `${error.code}: ${describeError(error.code).message}`;
}

/** Writes the rendered folder where the file was; `book.folder` is replaced by the file's own name. */
async function replaceFile(path: string, book: RenderedWorkbook): Promise<void> {
  await rm(path, { force: true });
  await mkdir(dirname(path), { recursive: true });
  const base = path.slice(dirname(path).length + 1);
  const files = book.files.map((file) => ({
    ...file,
    path: `${base}/${file.path.slice(book.folder.length + 1)}`,
  }));
  await writeRendered(dirname(path), '', { ...book, files });
}

class Pass {
  readonly cells: LimitCounter;
  budget = DEFAULT_MAX_TOTAL_BYTES;
  readonly entries: WorkbookEntry[] = [];
  readonly leftOut: LeftOut[] = [];
  readonly root: string;
  readonly limits: WorkbookLimits;
  readonly signal: AbortSignal;

  constructor(root: string, limits: WorkbookLimits, signal: AbortSignal) {
    this.root = root;
    this.limits = limits;
    this.signal = signal;
    this.cells = new LimitCounter(limits.maxCells);
  }

  /** Renders one workbook in place, or deletes it and lists it; a stop of the request is not a refusal. */
  async one(relative: string): Promise<void> {
    const path = join(this.root, ...relative.split('/'));
    try {
      if (this.entries.length >= this.limits.maxFiles) {
        throw workbookTooManyFiles(this.limits.maxFiles);
      }
      const model = await readWorkbook(
        { path, fileName: relative },
        this.limits,
        this.cells,
        this.signal,
      );
      const book = renderWorkbook(model, { maxTotalBytes: this.budget });
      this.budget -= book.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
      const upload = { fileName: relative, path, size: (await stat(path)).size };
      const entry = entryOf(upload, await fileHash(path), relative, book);
      await replaceFile(path, book);
      this.entries.push(entry);
    } catch (error) {
      this.signal.throwIfAborted();
      await rm(path, { force: true });
      this.leftOut.push({ name: relative, reason: this.reason(error) });
    }
  }

  private reason(error: unknown): string {
    if (error instanceof RosettaError) return reasonOf(error);
    throw error;
  }
}

/** Renders the workbooks of an unpacked zip in place; nothing changes for a tree that holds none. */
// RF-152, Q-41
export async function renderZipWorkbooks(
  root: string,
  limits: WorkbookLimits,
  signal: AbortSignal,
): Promise<ZipWorkbooks | undefined> {
  const paths = await workbookPaths(root);
  if (paths.length === 0) return undefined;
  const pass = new Pass(root, limits, signal);
  for (const relative of paths) await pass.one(relative);
  return { entries: pass.entries, lines: pass.entries.map(summaryOf), leftOut: pass.leftOut };
}
