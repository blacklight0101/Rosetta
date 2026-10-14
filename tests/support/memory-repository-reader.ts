import type {
  FileBytes,
  GrepRequest,
  GrepResult,
  LineRange,
  ReadBytesRequest,
  ReadLinesRequest,
  ReadRefusal,
  RepositoryReader,
} from '../../src/application/ports/repository-reader.js';
import { err, ok, type Result } from '../../src/domain/errors/result.js';
import { cutLine, grepLimits } from '../../src/infrastructure/files/grep-limits.js';
import { grepResult, type SearchedFile } from '../../src/infrastructure/files/grep-result.js';
import { refusal } from '../../src/infrastructure/files/read-refusals.js';

// RF-201: a RepositoryReader over files held in memory, for unit tests of the agent tools. It
// counts every call, so a test can prove a tool refused a request before it reached the reader.
// Lines, ranges, path lists and refusals follow NodeRepositoryReader (the mirror contract, P1-90),
// and so do its caps: files above `maxFileBytes` and matches past the grep cap (P1-119). Lines are
// cut and the grep answer is built by the real reader's code, so the notices match (P1-127).

const notFound = refusal('not-found');
const invalidPattern = refusal('invalid-pattern');
const invalidRange = refusal('invalid-range');
const tooLarge = refusal('too-large');

/** The default of `scan.maxFileBytes` (data-model.md 3.1), as in NodeRepositoryReader. */
const defaultMaxFileBytes = 1_000_000;

export interface MemoryRepositoryReaderOptions {
  /** The project's `scan.maxFileBytes`; the real reader's default when absent. */
  readonly maxFileBytes?: number | undefined;
}

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function isValidRange({ startLine, endLine }: ReadLinesRequest, total: number): boolean {
  return (
    Number.isInteger(startLine) &&
    Number.isInteger(endLine) &&
    startLine >= 1 &&
    startLine <= endLine &&
    startLine <= total
  );
}

/** A file as grep searches it: every line cut to the limit, as in NodeRepositoryReader. */
function searchedFile(path: string, lines: readonly string[]): SearchedFile {
  const cut = lines.map(cutLine);
  return { path, lines: cut.map((line) => line.text), cut: cut.map((line) => line.cut) };
}

export class MemoryRepositoryReader implements RepositoryReader {
  readonly liftedDenyPatterns: readonly string[] = [];
  readonly skippedPaths = { links: [], invalidNames: [] };
  readonly subpath = '';
  /** The paths of every readLines call, in order. */
  readonly reads: string[] = [];
  /** The patterns of every grep call, in order. */
  readonly greps: string[] = [];
  /** The path list of every grep call that sent one, in order. */
  readonly grepPaths: (readonly string[])[] = [];
  private readonly texts: ReadonlyMap<string, string>;
  private readonly files: ReadonlyMap<string, readonly string[]>;
  private readonly oversized: ReadonlySet<string>;

  constructor(
    files: Readonly<Record<string, string>>,
    options: MemoryRepositoryReaderOptions = {},
  ) {
    const limit = options.maxFileBytes ?? defaultMaxFileBytes;
    this.oversized = new Set(
      Object.entries(files)
        .filter(([, text]) => new TextEncoder().encode(text).length > limit)
        .map(([path]) => path),
    );
    this.texts = new Map(Object.entries(files));
    this.files = new Map(Object.entries(files).map(([path, text]) => [path, splitLines(text)]));
  }

  listFiles(): Promise<readonly string[]> {
    return Promise.resolve([...this.files.keys()].sort());
  }

  readLines(request: ReadLinesRequest): Promise<Result<LineRange, ReadRefusal>> {
    this.reads.push(request.path);
    const lines = this.files.get(request.path);
    if (lines === undefined) return Promise.resolve(err(notFound));
    if (this.oversized.has(request.path)) return Promise.resolve(err(tooLarge));
    if (!isValidRange(request, lines.length)) return Promise.resolve(err(invalidRange));
    const endLine = Math.min(request.endLine, lines.length);
    return Promise.resolve(
      ok({
        path: request.path,
        startLine: request.startLine,
        endLine,
        totalLines: lines.length,
        lines: lines.slice(request.startLine - 1, endLine),
      }),
    );
  }

  grep(request: GrepRequest): Promise<Result<GrepResult, ReadRefusal>> {
    this.greps.push(request.pattern);
    if (request.paths !== undefined) this.grepPaths.push(request.paths);
    let pattern: RegExp;
    try {
      pattern = new RegExp(request.pattern);
    } catch {
      return Promise.resolve(err(invalidPattern));
    }
    const wanted = request.paths === undefined ? undefined : new Set(request.paths);
    const selected = [...this.files.entries()]
      .filter(([path]) => wanted === undefined || wanted.has(path))
      .sort(([a], [b]) => (a < b ? -1 : 1));
    const searched = selected
      .filter(([path]) => !this.oversized.has(path))
      .map(([path, lines]) => searchedFile(path, lines));
    const matches = searched.flatMap(({ path, lines }) =>
      lines.flatMap((text, index) => (pattern.test(text) ? [{ path, line: index + 1 }] : [])),
    );
    const tooLarge = selected.length - searched.length;
    return Promise.resolve(
      ok(
        grepResult(
          { files: searched, tooLarge, overBudget: 0, budget: grepLimits.maxTotalBytes },
          matches,
        ),
      ),
    );
  }

  readBytes(request: ReadBytesRequest): Promise<Result<FileBytes, ReadRefusal>> {
    const text = this.texts.get(request.path);
    if (text === undefined) return Promise.resolve(err(notFound));
    const bytes = new TextEncoder().encode(text);
    return Promise.resolve(ok({ path: request.path, sizeBytes: bytes.length, bytes }));
  }
}
