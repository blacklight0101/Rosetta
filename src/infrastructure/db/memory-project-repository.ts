import type {
  ProjectRepository,
  SettingsChange,
  SettingsUpdate,
  StoredProject,
} from '../../application/ports/project-repository.js';
import type { Project } from '../../application/projects/project.js';

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

  list(userId: string, limit?: number): Promise<readonly Project[]> {
    const own = [...this.projects.values()].filter((project) => project.userId === userId);
    return Promise.resolve(own.sort(newestFirst).slice(0, limit));
  }

  find(userId: string, projectId: string): Promise<Project | undefined> {
    return Promise.resolve(this.owned(userId, projectId));
  }

  updateSettings(change: SettingsChange): Promise<SettingsUpdate> {
    const { userId, projectId, settings, updatedAt, expectedVersion } = change;
    const project = this.owned(userId, projectId);
    if (project === undefined) return Promise.resolve({ kind: 'missing' });
    if (expectedVersion !== undefined && expectedVersion !== project.settingsVersion) {
      return Promise.resolve({ kind: 'stale', currentVersion: project.settingsVersion });
    }
    const updated = {
      ...project,
      settings,
      updatedAt,
      settingsVersion: project.settingsVersion + 1,
    };
    this.projects.set(projectId, updated);
    return Promise.resolve({ kind: 'updated', project: updated });
  }

  async remove(
    userId: string,
    projectId: string,
    afterRowsGone: () => Promise<void>,
  ): Promise<boolean> {
    if (this.owned(userId, projectId) === undefined) return false;
    this.projects.delete(projectId);
    await afterRowsGone();
    return true;
  }

  private owned(userId: string, projectId: string): Project | undefined {
    const project = this.projects.get(projectId);
    return project?.userId === userId ? project : undefined;
  }
}
