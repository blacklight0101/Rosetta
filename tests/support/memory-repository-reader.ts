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
import { refusal } from '../../src/infrastructure/files/read-refusals.js';

// RF-201: a RepositoryReader over files held in memory, for unit tests of the agent tools. It
// counts every call, so a test can prove a tool refused a request before it reached the reader.
// Lines, ranges, path lists and refusals follow NodeRepositoryReader (the mirror contract, P1-90).

const notFound = refusal('not-found');
const invalidPattern = refusal('invalid-pattern');
const invalidRange = refusal('invalid-range');

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

  constructor(files: Readonly<Record<string, string>>) {
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
    const sorted = [...this.files.entries()]
      .filter(([path]) => wanted === undefined || wanted.has(path))
      .sort(([a], [b]) => (a < b ? -1 : 1));
    const matches = sorted.flatMap(([path, lines]) =>
      lines.flatMap((text, index) =>
        pattern.test(text) ? [{ path, line: index + 1, text, cut: false }] : [],
      ),
    );
    const cutLines = request.pattern === 'cut' ? 1 : 0;
    const notice = cutLines === 0 ? {} : { notice: 'Lines were cut before the search.' };
    return Promise.resolve(ok({ matches, cutLines, ...notice }));
  }

  readBytes(request: ReadBytesRequest): Promise<Result<FileBytes, ReadRefusal>> {
    const text = this.texts.get(request.path);
    if (text === undefined) return Promise.resolve(err(notFound));
    const bytes = new TextEncoder().encode(text);
    return Promise.resolve(ok({ path: request.path, sizeBytes: bytes.length, bytes }));
  }
}
