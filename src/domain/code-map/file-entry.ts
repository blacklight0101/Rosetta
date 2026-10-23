import type { MapLevel } from './map-level.js';
import type { ArtefactKind } from './artefact.js';
import { err, ok, type Result } from '../errors/result.js';

// RF-100, RF-101, RF-105, RF-124: one listed file of the code map (data-model 3.4 `files[]`).

/** RF-100: why a listed file was not read. */
export type SkipReason = 'binary' | 'too-large';

export interface FileEntry {
  /** Relative to the repository root, forward slashes (RF-124). */
  readonly path: string;
  /** A lower-case id, or `unknown` (RF-101). */
  readonly language: string;
  /** 0 for a skipped file. */
  readonly lines: number;
  /** 0 for a skipped file. */
  readonly estimatedTokens: number;
  /** Lower-case SHA-256; absent on a too-large file, which is never read. */
  readonly sha256?: string;
  /** Sorted, without duplicates. */
  readonly artefactKinds: readonly ArtefactKind[];
  readonly mapLevel: MapLevel;
  readonly skipped?: SkipReason;
  /** P3-112: the scan read a library header or a generated schema; absent otherwise. */
  readonly vendored?: true;
}

export type FileEntryProblem =
  | 'invalid-path'
  | 'invalid-count'
  | 'invalid-hash'
  | 'skipped-file-has-counts'
  | 'too-large-file-has-hash';

/** A path is capped so a hostile snapshot cannot make the map arbitrarily large. */
const maxPathLength = 1024;
/** The length check comes first so the pattern never meets a long input. */
const maxHashLength = 64;
const sha256Form = /^[0-9a-f]{64}$/u;

/** RF-124: relative, forward slashes, no empty, `.` or `..` segment, no drive letter. */
function isRepositoryRelativePath(path: string): boolean {
  if (path.length === 0 || path.length > maxPathLength) return false;
  if (path.includes('\\') || path.startsWith('/')) return false;
  if (path[1] === ':') return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isSha256(value: string): boolean {
  return value.length <= maxHashLength && sha256Form.test(value);
}

function skipProblem(input: FileEntry): FileEntryProblem | undefined {
  if (input.skipped === undefined) return undefined;
  if (input.lines !== 0 || input.estimatedTokens !== 0) return 'skipped-file-has-counts';
  return input.skipped === 'too-large' && input.sha256 !== undefined
    ? 'too-large-file-has-hash'
    : undefined;
}

function problemOf(input: FileEntry): FileEntryProblem | undefined {
  if (!isRepositoryRelativePath(input.path)) return 'invalid-path';
  if (!isCount(input.lines) || !isCount(input.estimatedTokens)) return 'invalid-count';
  if (input.sha256 !== undefined && !isSha256(input.sha256)) return 'invalid-hash';
  return skipProblem(input);
}

/** Checks the invariants of a listed file and returns a copy of it. */
export function createFileEntry(input: FileEntry): Result<FileEntry, FileEntryProblem> {
  const problem = problemOf(input);
  if (problem !== undefined) return err(problem);
  return ok({ ...input, artefactKinds: [...input.artefactKinds] });
}
