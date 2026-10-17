import type {
  FolderTarget,
  ListedFolder,
  WorkspaceFolders,
} from '../../src/application/ports/workspace-folders.js';

// RF-1012: a WorkspaceFolders over folders kept in memory, for tests of the layers above it. A
// folder is given files with `seed`; `removals` lists what was removed, in order. While
// `refuseRemoval` is set, `remove` fails the way a folder held open or without permission does and
// removes nothing (P1-121).

function pathOf(target: FolderTarget): string {
  const parts = [target.userId, target.projectId];
  return (target.runKey === undefined ? parts : [...parts, target.runKey]).join('/');
}

function byteLength(files: Readonly<Record<string, string>>): number {
  return Object.values(files).reduce((sum, content) => sum + Buffer.byteLength(content), 0);
}

export class MemoryWorkspaceFolders implements WorkspaceFolders {
  readonly removals: FolderTarget[] = [];
  refuseRemoval = false;
  private readonly refused = new Set<string>();
  private readonly folders = new Map<string, Readonly<Record<string, string>>>();
  private readonly changed = new Map<string, number>();
  private readonly marks = new Set<string>();
  /** While set, `list` fails the way an unreadable data folder does. */
  refuseListing = false;

  /**
   * Gives the run folder (or, without a run key, the project folder) these files, last changed at
   * `modifiedAt` (epoch ms; 0 by default, that is, long ago). A run folder implies its project
   * folder, as on disk, changed at the same instant unless the project folder is seeded itself.
   */
  seed(target: FolderTarget, files: Readonly<Record<string, string>>, modifiedAt = 0): void {
    this.folders.set(pathOf(target), files);
    this.changed.set(pathOf(target), modifiedAt);
  }

  list(): Promise<readonly ListedFolder[]> {
    if (this.refuseListing) return Promise.reject(new Error('EIO: the data folder is unreadable'));
    const listed = new Map<string, ListedFolder>();
    for (const path of this.folders.keys()) {
      const [userId = '', projectId = '', runKey] = path.split('/');
      const modifiedAt = this.changed.get(path) ?? 0;
      const project = { userId, projectId };
      const marked = this.marks.has(path);
      if (runKey === undefined) listed.set(path, { target: project, modifiedAt, marked });
      else {
        if (!this.folders.has(pathOf(project)))
          listed.set(pathOf(project), {
            target: project,
            modifiedAt,
            marked: this.marks.has(pathOf(project)),
          });
        listed.set(path, { target: { ...project, runKey }, modifiedAt, marked });
      }
    }
    return Promise.resolve(
      [...listed.values()].sort((a, b) => pathOf(a.target).localeCompare(pathOf(b.target))),
    );
  }

  /** Marks the folder when it exists (P2-41); a missing folder is not marked. */
  mark(target: FolderTarget): Promise<void> {
    if (this.has(target)) this.marks.add(pathOf(target));
    return Promise.resolve();
  }

  unmark(target: FolderTarget): Promise<void> {
    this.marks.delete(pathOf(target));
    return Promise.resolve();
  }

  /** True while the folder carries the mark of a delete flow. */
  isMarked(target: FolderTarget): boolean {
    return this.marks.has(pathOf(target));
  }

  /** True while the folder, or one inside it, holds files. */
  has(target: FolderTarget): boolean {
    return this.paths(target).length > 0;
  }

  size(target: FolderTarget): Promise<number> {
    const sizes = this.paths(target).map((path) => byteLength(this.folders.get(path) ?? {}));
    return Promise.resolve(sizes.reduce((sum, bytes) => sum + bytes, 0));
  }

  /** Makes `remove` fail for this one folder, as for a folder held open. */
  refuseRemovalOf(target: FolderTarget): void {
    this.refused.add(pathOf(target));
  }

  remove(target: FolderTarget): Promise<void> {
    if (this.refuseRemoval || this.refused.has(pathOf(target))) {
      const refused = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return Promise.reject(refused);
    }
    this.removals.push(target);
    for (const path of this.paths(target)) {
      this.folders.delete(path);
      this.marks.delete(path);
    }
    return Promise.resolve();
  }

  /** The folder itself and everything below it. */
  private paths(target: FolderTarget): string[] {
    const own = pathOf(target);
    return [...this.folders.keys()].filter((path) => path === own || path.startsWith(`${own}/`));
  }
}
