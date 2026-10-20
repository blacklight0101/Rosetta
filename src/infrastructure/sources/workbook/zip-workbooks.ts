import { readdir, rm, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { LeftOut, WorkbookSummaryLine } from '../../../application/ports/workbook-staging.js';
import { describeError } from '../../../domain/errors/descriptions.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import type { WorkbookEntry } from '../../../domain/sources/source.js';
import { LimitCounter } from '../entry-guards.js';
import { workbookTooManyFiles } from './workbook-errors.js';
import type { WorkbookLimits } from './workbook-limits.js';
import { readWorkbook } from './workbook-reader.js';
import type { WorkbookModel } from './workbook-model.js';
import type { RenderedWorkbook } from './workbook-renderer.js';
import { renderZip } from './zip-render.js';
import { entryOf, fileHash, macroLeftOut, summaryOf, writeRendered } from './workbook-tree.js';

// RF-152, RF-150, Q-41, DEC-150: the workbooks inside an unpacked zip. Each `.xlsx` or `.xlsm` is read
// under the workbook limits and replaced, in the same place, by the folder it renders to; one that
// cannot be rendered (legacy format, password, a limit) is deleted and listed with its reason, and
// the rest of the zip is kept. The cells and the rendered text are counted for the whole zip, and one
// dependency map (`dependencies.md`, RF-153) spans all of the workbooks that were rendered.

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

/** The name for the map: `dependencies.md`, or a name beside a file of the zip that has it (RF-153). */
async function mapName(root: string): Promise<string> {
  const taken = new Set((await readdir(root)).map((name) => name.toLowerCase()));
  let name = 'dependencies.md';
  for (let n = 1; taken.has(name); n += 1) {
    name = n === 1 ? 'dependencies (workbooks).md' : `dependencies (workbooks ${String(n)}).md`;
  }
  return name;
}

interface Read {
  readonly relative: string;
  readonly path: string;
  readonly model: WorkbookModel;
}

class Pass {
  readonly cells: LimitCounter;
  readonly entries: WorkbookEntry[] = [];
  readonly leftOut: LeftOut[] = [];
  readonly root: string;
  readonly limits: WorkbookLimits;
  readonly signal: AbortSignal;
  private count = 0;

  constructor(root: string, limits: WorkbookLimits, signal: AbortSignal) {
    this.root = root;
    this.limits = limits;
    this.signal = signal;
    this.cells = new LimitCounter(limits.maxCells);
  }

  /** Reads one workbook, or deletes it and lists it; a stop of the request is not a refusal. */
  async read(relative: string): Promise<Read | undefined> {
    const path = join(this.root, ...relative.split('/'));
    try {
      if (this.count >= this.limits.maxFiles) throw workbookTooManyFiles(this.limits.maxFiles);
      const file = { path, fileName: relative };
      const model = await readWorkbook(file, this.limits, this.cells, this.signal);
      this.count += 1;
      return { relative, path, model };
    } catch (error) {
      await this.leave(path, relative, error);
      return undefined;
    }
  }

  /** Renders what was read as one project, writes each workbook in place and then the map. */
  async render(reads: readonly Read[]): Promise<void> {
    if (reads.length === 0) return;
    const { live, rendered, refused } = renderZip(
      reads.map((read) => ({ model: read.model, folder: read.relative })),
    );
    for (const [index, error] of refused) {
      const read = reads[index];
      if (read !== undefined) await this.leave(read.path, read.relative, error);
    }
    for (const [position, index] of live.entries()) {
      const read = reads[index];
      const book = rendered.workbooks[position];
      if (read !== undefined && book !== undefined) await this.place(read, book);
    }
    if (this.entries.length === 0) return;
    const file = { ...rendered.dependencies, path: await mapName(this.root) };
    await writeRendered(this.root, '', { files: [file] });
  }

  private async place(read: Read, book: RenderedWorkbook): Promise<void> {
    try {
      const upload = {
        fileName: read.relative,
        path: read.path,
        size: (await stat(read.path)).size,
      };
      const entry = entryOf(upload, await fileHash(read.path), read.relative, book);
      await rm(read.path, { force: true });
      await writeRendered(this.root, '', book);
      this.entries.push(entry);
      this.leftOut.push(...macroLeftOut(read.relative, book));
    } catch (error) {
      await this.leave(read.path, read.relative, error);
    }
  }

  private async leave(path: string, name: string, error: unknown): Promise<void> {
    this.signal.throwIfAborted();
    await rm(path, { recursive: true, force: true });
    this.leftOut.push({ name, reason: this.reason(error) });
  }

  private reason(error: unknown): string {
    if (error instanceof RosettaError) return reasonOf(error);
    throw error;
  }
}

/** Renders the workbooks of an unpacked zip in place; nothing changes for a tree that holds none. */
// RF-152, RF-153, Q-41
export async function renderZipWorkbooks(
  root: string,
  limits: WorkbookLimits,
  signal: AbortSignal,
): Promise<ZipWorkbooks | undefined> {
  const paths = await workbookPaths(root);
  if (paths.length === 0) return undefined;
  const pass = new Pass(root, limits, signal);
  const reads: Read[] = [];
  for (const relative of paths) {
    const read = await pass.read(relative);
    if (read !== undefined) reads.push(read);
  }
  await pass.render(reads);
  return { entries: pass.entries, lines: pass.entries.map(summaryOf), leftOut: pass.leftOut };
}
