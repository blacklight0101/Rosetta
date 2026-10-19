import type {
  ProjectRepository,
  SettingsChange,
  SettingsUpdate,
  StoredProject,
  UploadAttachment,
} from '../../application/ports/project-repository.js';
import type { RunIndex } from '../../application/ports/run-index.js';
import type { Project } from '../../application/projects/project.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { hasValidSourceShape } from '../../domain/sources/source-shape.js';

// Architecture section 7, RF-010, RF-1105: projects in memory, for unit tests. Passes the same
// contract suite as PgProjectRepository: unique on user, source URL, ref and subpath; every
// operation scoped by the owner; lists newest first, ties by id.

/** A GitHub source is one project per user; an upload is only ever itself (RF-128). */
function sourceKey(project: Project): string {
  if (project.sourceKind === 'upload') return JSON.stringify(['upload', project.id]);
  return JSON.stringify([project.userId, project.sourceUrl, project.ref, project.subpath]);
}

function newestFirst(left: Project, right: Project): number {
  if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export class MemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();
  private runs: Pick<RunIndex, 'list'> | undefined;

  /** The runs `lastRunSnapshotKey` is read from, as the database reads them. */
  followRuns(runs: Pick<RunIndex, 'list'>): void {
    this.runs = runs;
  }

  insertOrFind(project: Project): Promise<StoredProject> {
    if (!hasValidSourceShape(project.sourceKind, project)) {
      return Promise.reject(
        new RosettaError(ERROR_CODES.requestInvalid, 'An uploaded project has no source address.'),
      );
    }
    const existing = [...this.projects.values()].find(
      (stored) => sourceKey(stored) === sourceKey(project),
    );
    if (existing !== undefined) return Promise.resolve({ project: existing, created: false });
    this.projects.set(project.id, project);
    return Promise.resolve({ project, created: true });
  }

  async list(userId: string, limit?: number): Promise<readonly Project[]> {
    const own = [...this.projects.values()].filter((project) => project.userId === userId);
    return Promise.all(
      own
        .sort(newestFirst)
        .slice(0, limit)
        .map((p) => this.withLastRun(p)),
    );
  }

  async find(userId: string, projectId: string): Promise<Project | undefined> {
    const project = this.owned(userId, projectId);
    return project === undefined ? undefined : this.withLastRun(project);
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

  async attachUpload(change: UploadAttachment): Promise<Project | undefined> {
    const project = this.owned(change.userId, change.projectId);
    if (project?.sourceKind !== 'upload') return undefined;
    const updated = { ...project, upload: change.upload, updatedAt: change.updatedAt };
    this.projects.set(project.id, updated);
    return this.withLastRun(updated);
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

  /** The project with the snapshot of its newest run that has one, as the database reads it. */
  private async withLastRun(project: Project): Promise<Project> {
    if (this.runs === undefined) return project;
    const runs = await this.runs.list(project.userId, project.id);
    const key = runs.find((run) => run.snapshotKey !== null)?.snapshotKey;
    return key === undefined || key === null ? project : { ...project, lastRunSnapshotKey: key };
  }

  private owned(userId: string, projectId: string): Project | undefined {
    const project = this.projects.get(projectId);
    return project?.userId === userId ? project : undefined;
  }
}
