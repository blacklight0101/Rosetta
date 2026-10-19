import type { EpochMs } from '../../domain/accounts/user.js';
import type { Project, ProjectUpload } from '../projects/project.js';
import type { ProjectSettings } from '../projects/project-settings.js';

// Architecture section 7, RF-010, RF-1105: projects and their settings. Every operation takes the
// owner's id and sees only that user's rows, so another user's project id finds nothing. A project
// is unique on (user, source URL, ref, subpath) (data-model.md section 4).

export interface StoredProject {
  readonly project: Project;
  /** False when the user already had a project with the same source and it was returned instead. */
  readonly created: boolean;
}

export interface SettingsChange {
  readonly userId: string;
  readonly projectId: string;
  readonly settings: ProjectSettings;
  readonly updatedAt: EpochMs;
  /** The version the save started from; undefined saves whatever is stored. */
  readonly expectedVersion: number | undefined;
}

export type SettingsUpdate =
  | { readonly kind: 'updated'; readonly project: Project }
  | { readonly kind: 'missing' }
  | { readonly kind: 'stale'; readonly currentVersion: number };

export interface UploadAttachment {
  readonly userId: string;
  readonly projectId: string;
  readonly upload: ProjectUpload;
  readonly updatedAt: EpochMs;
}

export interface ProjectRepository {
  /** Stores the project, or returns the owner's existing project with the same source. */
  insertOrFind(project: Project): Promise<StoredProject>;
  /** The owner's projects, newest first; at most `limit` of them when it is given. */
  list(userId: string, limit?: number): Promise<readonly Project[]>;
  /** Undefined for an unknown id and for another user's project. */
  find(userId: string, projectId: string): Promise<Project | undefined>;
  /**
   * Replaces the settings and counts the version. With `expectedVersion` the save happens only if
   * the stored version is still that one, decided in the same step as the write, so two saves from
   * the same version never both succeed (P1-106); without it the save is unconditional. `missing`
   * for an unknown id and for another user's project, whatever the version.
   */
  updateSettings(change: SettingsChange): Promise<SettingsUpdate>;
  /**
   * Records the zip an upload project holds now (RF-128), replacing the earlier one. Undefined for an
   * unknown id, another user's project and a GitHub project, and then nothing is written.
   */
  attachUpload(change: UploadAttachment): Promise<Project | undefined>;
  /**
   * Removes the project (RF-1012); false for an unknown id and for another user's project, and
   * then `afterRowsGone` is not called. PostgreSQL also refuses (false) while a run of the project
   * is queued or running, also one queued during the removal, and removes the project's run rows
   * with it; the cost ledger keeps its rows (DEC-55). The rows are removed and committed first, then
   * `afterRowsGone` (the folder removal) runs with no connection or lock held, so a slow disk holds
   * neither (P1-138); when it throws, the rows stay removed and the error is rethrown.
   */
  remove(userId: string, projectId: string, afterRowsGone: () => Promise<void>): Promise<boolean>;
}
