import { isThirdPartyPath } from '../../../domain/code-map/third-party.js';
import type { ReaderCase } from './reader-case.js';

// RF-1410: the files and lines of a reader case as the run's read gate counts them. A path resolves
// as `CodeMapIndex.resolve` resolves it (the exact spelling, else the one file that differs only in
// letter case); a skipped file is not readable (`readableAreaEntries`); a read is cut to the file
// and to the default `scan.excerptMaxLines` (RF-144); the share counts lines of the files that are
// not third-party (`readShare`), since a case holds each file's lines and not its tokens.

/** The default most lines one `read_file` call returns (`scan.excerptMaxLines`, RF-144). */
const MAX_READ_LINES = 400;

export interface ReadableFile {
  readonly path: string;
  readonly lines: number;
}

export interface ReadableFiles {
  /** The readable file a path names, as the code map resolves it; undefined when none. */
  resolve(path: string): ReadableFile | undefined;
  /** The lines of the readable files that are not third-party: the base of the share. */
  readonly shareLines: number;
  /** Whether a readable file is neither generated nor a descriptor. */
  readonly hasPlainFile: boolean;
}

/** Generated code and descriptors: lines a run counts in the share but no card describes. */
const GENERATED_OR_DESCRIPTOR = [
  /\.designer\.(?:cs|vb)$/iu,
  /(?:^|\/)reference\.(?:cs|vb)$/iu,
  /\.(?:wsdl|xsd|svcmap|svcinfo|disco|resx|csproj|vbproj|sfproj|sln|pubxml)$/iu,
  /(?:^|\/)packages\.config$/iu,
  /(?:^|\/)assemblyinfo\.(?:cs|vb)$/iu,
];

// RF-1410
export function isGeneratedOrDescriptor(path: string): boolean {
  return GENERATED_OR_DESCRIPTOR.some((pattern) => pattern.test(path));
}

// RF-1410
export function readableFilesOf(files: ReaderCase['files']): ReadableFiles {
  const readable = files
    .filter((file) => file.skipped === undefined)
    .map((file) => ({ path: file.path, lines: file.lines ?? 0 }));
  const exact = new Map(readable.map((file) => [file.path, file]));
  const folded = new Map<string, ReadableFile[]>();
  for (const file of readable) {
    const key = file.path.toLowerCase();
    folded.set(key, [...(folded.get(key) ?? []), file]);
  }
  return {
    resolve: (path) => {
      const found = exact.get(path);
      if (found !== undefined) return found;
      const matches = folded.get(path.toLowerCase()) ?? [];
      return matches.length === 1 ? matches[0] : undefined;
    },
    shareLines: readable
      .filter((file) => !isThirdPartyPath(file.path))
      .reduce((sum, file) => sum + file.lines, 0),
    hasPlainFile: readable.some((file) => !isGeneratedOrDescriptor(file.path)),
  };
}

interface Range {
  readonly start: number;
  readonly end: number;
}

/** The lines read so far, per file. */
// RF-1410
export class LinesRead {
  private readonly ranges = new Map<string, Range[]>();

  /** Adds one read, cut as the run cuts it, and returns how many of its lines are new. */
  add(path: string, startLine: number, endLine: number, fileLines: number): number {
    const start = Math.max(1, startLine);
    const end = Math.min(endLine, fileLines, start + MAX_READ_LINES - 1);
    if (end < start) return 0;
    const before = this.ranges.get(path) ?? [];
    const overlap = before.reduce(
      (sum, range) =>
        sum + Math.max(0, Math.min(end, range.end) - Math.max(start, range.start) + 1),
      0,
    );
    this.ranges.set(path, merged([...before, { start, end }]));
    return end - start + 1 - overlap;
  }

  /** The lines a read covers once cut, whether new or not. */
  static covered(startLine: number, endLine: number, fileLines: number): number {
    const start = Math.max(1, startLine);
    return Math.max(0, Math.min(endLine, fileLines, start + MAX_READ_LINES - 1) - start + 1);
  }
}

/** Ranges joined where they overlap, so a line is never counted twice. */
function merged(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const out: Range[] = [];
  for (const range of sorted) {
    const last = out.at(-1);
    if (last !== undefined && range.start <= last.end) {
      out[out.length - 1] = { start: last.start, end: Math.max(last.end, range.end) };
    } else out.push(range);
  }
  return out;
}
