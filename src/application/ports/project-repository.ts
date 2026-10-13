import type { EpochMs } from '../../domain/accounts/user.js';
import type { Project } from '../projects/project.js';
import type { ProjectSettings } from '../projects/project-settings.js';

// Architecture section 7, RF-010, RF-1105: projects and their settings. Every operation takes the
// owner's id and sees only that user's rows, so another user's project id finds nothing. A project
// is unique on (user, source URL, ref, subpath) (data-model.md section 4).

export interface StoredProject {
  readonly project: Project;
  /** False when the user already had a project with the same source and it was returned instead. */
  readonly created: boolean;
}

export interface ProjectRepository {
  /** Stores the project, or returns the owner's existing project with the same source. */
  insertOrFind(project: Project): Promise<StoredProject>;
  /** The owner's projects, newest first. */
  list(userId: string): Promise<readonly Project[]>;
  /** Undefined for an unknown id and for another user's project. */
  find(userId: string, projectId: string): Promise<Project | undefined>;
  /** Replaces the settings; undefined for an unknown id and for another user's project. */
  updateSettings(
    userId: string,
    projectId: string,
    settings: ProjectSettings,
    updatedAt: EpochMs,
  ): Promise<Project | undefined>;
  /**
   * Removes the project (RF-1012); false for an unknown id and for another user's project.
   * PostgreSQL also refuses (false) while a run of the project is queued or running and removes
   * the project's run rows with it; the cost ledger keeps its rows (DEC-55).
   */
  remove(userId: string, projectId: string): Promise<boolean>;
}
