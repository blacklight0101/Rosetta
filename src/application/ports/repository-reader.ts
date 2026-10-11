import type { ErrorCode } from '../../domain/errors/codes.js';
import type { Result } from '../../domain/errors/result.js';

// RF-005, RF-140, RF-146, RF-147: read-only access to one snapshot. The port has no write
// operation on purpose: an agent tool built on it cannot change the analysed repository.

/** Why a request was refused; the agent sees `message` (RF-140, RF-146). */
export type ReadRefusalReason =
  | 'outside-root'
  | 'invalid-path'
  | 'ignored'
  | 'denied'
  | 'not-found'
  | 'invalid-range'
  | 'pattern-too-long'
  | 'invalid-pattern'
  | 'timeout';

export interface ReadRefusal {
  readonly code: ErrorCode;
  readonly reason: ReadRefusalReason;
  readonly message: string;
}

/** Paths are relative to the repository root, with forward slashes (data-model section 1). */
export interface ReadLinesRequest {
  readonly path: string;
  /** 1-based, inclusive. */
  readonly startLine: number;
  readonly endLine: number;
}

export interface LineRange {
  readonly path: string;
  readonly startLine: number;
  /** The last line returned; at most the file's line count. */
  readonly endLine: number;
  readonly totalLines: number;
  readonly lines: readonly string[];
}

export interface GrepRequest {
  /** A JavaScript regular expression, at most 200 characters (RF-146). */
  readonly pattern: string;
  /** Optional gitignore-style pattern that limits the files searched. */
  readonly pathGlob?: string;
}

interface GrepMatch {
  readonly path: string;
  readonly line: number;
  readonly text: string;
  /** True when the line was longer than the limit and was cut before the search (RF-146). */
  readonly cut: boolean;
}

export interface GrepResult {
  readonly matches: readonly GrepMatch[];
  /** Searched lines that were cut; when above zero, `notice` tells the agent why. */
  readonly cutLines: number;
  readonly notice?: string;
}

/** Snapshot entries the reader left out, for the run record. */
export interface SkippedPaths {
  /** Symbolic links and junctions, never followed. */
  readonly links: readonly string[];
  /** Files whose names fail the path check (for example `aux.c` or `name.`), never read. */
  readonly invalidNames: readonly string[];
}

export interface RepositoryReader {
  /** Files under the subpath, without ignored or denied paths, sorted by path. */
  listFiles(): Promise<readonly string[]>;
  readLines(request: ReadLinesRequest): Promise<Result<LineRange, ReadRefusal>>;
  grep(request: GrepRequest): Promise<Result<GrepResult, ReadRefusal>>;
  /** Built-in deny patterns lifted by `scan.allowDenied`, for the run record (RF-147). */
  readonly liftedDenyPatterns: readonly string[];
  readonly skippedPaths: SkippedPaths;
}
