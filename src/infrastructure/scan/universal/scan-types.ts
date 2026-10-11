import type { ArtefactKind } from '../../../domain/code-map/artefact.js';
import type { SkipReason } from '../../../domain/code-map/file-entry.js';
import type { SqlVerb } from '../../../domain/code-map/vocabulary.js';
import type { SkippedPaths } from '../../../application/ports/repository-reader.js';

// RF-100..RF-103: what the universal scan reports. Language packs add symbols and references
// elsewhere (RF-110); nothing here depends on a stack's syntax.

/** One listed file. `language` is a lower-case id, or `unknown` (RF-101). */
export interface ScannedFile {
  /** Relative to the repository root, forward slashes (RF-124). */
  readonly path: string;
  readonly language: string;
  /** 0 for a skipped file. */
  readonly lines: number;
  /** About four characters per token; 0 for a skipped file. */
  readonly estimatedTokens: number;
  /** Absent for a file that was too large to read. */
  readonly sha256?: string;
  /** Sorted, without duplicates. */
  readonly artefactKinds: readonly ArtefactKind[];
  readonly skipped?: SkipReason;
}

/** RF-103: a statement and where it starts. */
export interface SqlStatement {
  readonly path: string;
  /** 1-based line where the statement starts. */
  readonly line: number;
  readonly verb: SqlVerb;
  /** Whitespace collapsed, cut to a 1536-character window; the code map masks, then cuts to 500. */
  readonly text: string;
}

export interface ScanOptions {
  /** `scan.maxFileBytes`: larger files are listed as `skipped: too-large` and never read. */
  readonly maxFileBytes: number;
}

export interface UniversalScan {
  /** Sorted by path. */
  readonly files: readonly ScannedFile[];
  /** Sorted by path, then line. */
  readonly sqlStatements: readonly SqlStatement[];
  /** Links and invalid names the reader left out (RF-100). */
  readonly skippedPaths: SkippedPaths;
  /** Files the reader listed but refused to read, sorted; they are not in `files`. */
  readonly unreadable: readonly string[];
}
