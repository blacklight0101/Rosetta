import type { EpochMs } from '../../domain/accounts/user.js';
import type {
  ProjectRepository,
  StoredProject,
} from '../../application/ports/project-repository.js';
import type { Project } from '../../application/projects/project.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';

// Architecture section 7, RF-010, RF-1105: projects in memory, for unit tests. Passes the same
// contract suite as PgProjectRepository: unique on user, source URL, ref and subpath; every
// operation scoped by the owner; lists newest first, ties by id.

function sourceKey(project: Project): string {
  return JSON.stringify([project.userId, project.sourceUrl, project.ref, project.subpath]);
}

function newestFirst(left: Project, right: Project): number {
  if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export class MemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();

  insertOrFind(project: Project): Promise<StoredProject> {
    const existing = [...this.projects.values()].find(
      (stored) => sourceKey(stored) === sourceKey(project),
    );
    if (existing !== undefined) return Promise.resolve({ project: existing, created: false });
    this.projects.set(project.id, project);
    return Promise.resolve({ project, created: true });
  }

  list(userId: string): Promise<readonly Project[]> {
    const own = [...this.projects.values()].filter((project) => project.userId === userId);
    return Promise.resolve(own.sort(newestFirst));
  }

  find(userId: string, projectId: string): Promise<Project | undefined> {
    return Promise.resolve(this.owned(userId, projectId));
  }

  updateSettings(
    userId: string,
    projectId: string,
    settings: ProjectSettings,
    updatedAt: EpochMs,
  ): Promise<Project | undefined> {
    const project = this.owned(userId, projectId);
    if (project === undefined) return Promise.resolve(undefined);
    const updated = { ...project, settings, updatedAt };
    this.projects.set(projectId, updated);
    return Promise.resolve(updated);
  }

  remove(userId: string, projectId: string): Promise<boolean> {
    void userId;
    void projectId;
    return Promise.resolve(false);
  }

  private owned(userId: string, projectId: string): Project | undefined {
    const project = this.projects.get(projectId);
    return project?.userId === userId ? project : undefined;
  }
}
