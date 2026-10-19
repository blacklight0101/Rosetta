// RF-126, RF-130, RFC-004 section 4.1: what identifies the code a run analysed, per kind of source.
// The two shapes share nothing: a GitHub source has a repository and a commit, an upload has a file
// name and an instant, and neither carries the other's fields. Every stage after the fetch reads the
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
}

export type Source = GithubSource | UploadSource;
