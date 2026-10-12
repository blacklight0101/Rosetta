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
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { err, ok, type Result } from '../../src/domain/errors/result.js';

// RF-201: a RepositoryReader over files held in memory, for unit tests of the agent tools. It
// counts every call, so a test can prove a tool refused a request before it reached the reader.

const notFound: ReadRefusal = {
  code: ERROR_CODES.fileNotFound,
  reason: 'not-found',
  message: 'There is no such file in the analysed repository; check the path and its case.',
};

export class MemoryRepositoryReader implements RepositoryReader {
  readonly liftedDenyPatterns: readonly string[] = [];
  readonly skippedPaths = { links: [], invalidNames: [] };
  readonly subpath = '';
  /** The paths of every readLines call, in order. */
  readonly reads: string[] = [];
  /** The patterns of every grep call, in order. */
  readonly greps: string[] = [];
  private readonly files: ReadonlyMap<string, readonly string[]>;

  constructor(files: Readonly<Record<string, string>>) {
    this.files = new Map(Object.entries(files).map(([path, text]) => [path, text.split('\n')]));
  }

  listFiles(): Promise<readonly string[]> {
    return Promise.resolve([...this.files.keys()].sort());
  }

  readLines(request: ReadLinesRequest): Promise<Result<LineRange, ReadRefusal>> {
    this.reads.push(request.path);
    const lines = this.files.get(request.path);
    if (lines === undefined) return Promise.resolve(err(notFound));
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
    const pattern = new RegExp(request.pattern);
    const matches = [...this.files.entries()].flatMap(([path, lines]) =>
      lines.flatMap((text, index) =>
        pattern.test(text) ? [{ path, line: index + 1, text, cut: false }] : [],
      ),
    );
    return Promise.resolve(ok({ matches, cutLines: 0 }));
  }

  readBytes(request: ReadBytesRequest): Promise<Result<FileBytes, ReadRefusal>> {
    const lines = this.files.get(request.path);
    if (lines === undefined) return Promise.resolve(err(notFound));
    const bytes = new TextEncoder().encode(lines.join('\n'));
    return Promise.resolve(ok({ path: request.path, sizeBytes: bytes.length, bytes }));
  }
}
