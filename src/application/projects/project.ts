import type { EpochMs } from '../../domain/accounts/user.js';
import type { SourceKind } from '../../domain/sources/source-kind.js';
import type { ProjectSettings } from './project-settings.js';

// Architecture section 5, data-model.md section 4 (`projects`), RF-010: a user's project. The
// source is a normalised GitHub address, or empty for an uploaded zip (RF-130); an empty `ref` means the default branch and an empty
// `subpath` the repository root. Instants are epoch milliseconds from the Clock port.

export interface Project {
  readonly id: string;
  /** The owner; every query is scoped by it (RF-1105). */
  readonly userId: string;
  /** `<owner>/<repo>` by default. */
  readonly name: string;
  /** `github` (a public repository) or `upload` (a zip the user sent); see `source-kind.ts` (RF-130). */
  readonly sourceKind: SourceKind;
  /**
   * `https://github.com/<owner>/<repo>`, lower case so that GitHub's case-insensitive names match;
   * empty for an upload, which has no address, ref or subpath.
   */
  readonly sourceUrl: string;
  readonly ref: string;
  readonly subpath: string;
  readonly settings: ProjectSettings;
  /** Counts the saves of the settings, from 1; a save may name the version it started from. */
  readonly settingsVersion: number;
  readonly createdAt: EpochMs;
  readonly updatedAt: EpochMs;
}
