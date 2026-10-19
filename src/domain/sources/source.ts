// RF-126, RF-130, RF-152, RFC-004 section 4.1, RFC-005 section 4.1: what identifies the code a run
// analysed, per kind of source. The three shapes share nothing: a GitHub source has a repository and
// a commit, an upload has a file name and an instant, a workbook source has an instant, a renderer
// version and its workbooks, and none carries another's fields. Every stage after the fetch reads the
// snapshot and never looks at the kind, except the citation link and the report header.

/** A public GitHub repository pinned to a commit (ADR-012). */
export interface GithubSource {
  /**
   * Absent on a record written before uploads existed and on every record Rosetta still writes for
   * GitHub, so a GitHub `snapshot.json` stays byte-identical; absent means `github`.
   */
  readonly kind?: 'github' | undefined;
  /** Canonical `https://github.com/<owner>/<repo>`. */
  readonly url: string;
  /** Owner and repository as GitHub spells them. */
  readonly owner: string;
  readonly repo: string;
  /** 40 hexadecimal characters. */
  readonly commitSha: string;
  /** The ref that was resolved: the one asked for, or the default branch when the URL had none. */
  readonly resolvedFrom: string;
  /** ISO 8601 instant in UTC. */
  readonly downloadedAt: string;
  /** SPDX id reported by GitHub, or `unknown`. */
  readonly licence: string;
}

/**
 * A zip the user uploaded (DEC-148). Its identity is the snapshot hash; it has no repository,
 * commit, ref, subpath or URL, and its licence is `unknown`.
 */
export interface UploadSource {
  readonly kind: 'upload';
  /** The file name as sent, with its `.zip`. */
  readonly fileName: string;
  /** ISO 8601 instant in UTC. */
  readonly uploadedAt: string;
  /**
   * RF-152: the workbooks the zip held, rendered with the rest of the tree. Absent when it held
   * none; an empty list is never kept, so a record with an empty list and one without it read alike.
   */
  readonly workbooks?: readonly WorkbookEntry[] | undefined;
}

/** What was counted in one workbook when it was rendered (RFC-005 section 4.1). */
export interface WorkbookCounts {
  readonly sheets: number;
  readonly nonEmptyCells: number;
  readonly formulas: number;
  readonly macroModules: number;
  readonly macrosSkipped: number;
}

/** One workbook of a workbook source or of an upload: the file as sent, where it was rendered, its counts. */
export interface WorkbookEntry {
  /** The file name as sent, with its extension. */
  readonly fileName: string;
  /** The folder of its rendered tree, relative to the snapshot root. */
  readonly folder: string;
  readonly sizeBytes: number;
  /** `sha256:` and 64 lower-case hexadecimal characters, of the file as sent. */
  readonly sha256: string;
  readonly counts: WorkbookCounts;
}

/**
 * Excel workbooks the user uploaded, rendered to text (DEC-150). Its identity is the snapshot hash
 * of the rendered tree; it has no repository, commit, ref, subpath, URL or zip file name, and its
 * licence is `unknown`.
 */
export interface WorkbookSource {
  readonly kind: 'workbook';
  /** ISO 8601 instant in UTC. */
  readonly uploadedAt: string;
  /** Which renderer wrote the tree; a new version can give a new hash for the same files. */
  readonly rendererVersion: string;
  /** At least one, in the order they were rendered. */
  readonly workbooks: readonly WorkbookEntry[];
}

export type Source = GithubSource | UploadSource | WorkbookSource;
