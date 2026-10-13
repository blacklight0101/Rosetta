import type {
  FolderTarget,
  WorkspaceFolders,
} from '../../src/application/ports/workspace-folders.js';

// RF-1012: a WorkspaceFolders over folders kept in memory, for tests of the layers above it. A
// folder is given files with `seed`; `removals` lists what was removed, in order.

function pathOf(target: FolderTarget): string {
  const parts = [target.userId, target.projectId];
  return (target.runKey === undefined ? parts : [...parts, target.runKey]).join('/');
}

function byteLength(files: Readonly<Record<string, string>>): number {
  return Object.values(files).reduce((sum, content) => sum + Buffer.byteLength(content), 0);
}

export class MemoryWorkspaceFolders implements WorkspaceFolders {
  readonly removals: FolderTarget[] = [];
  private readonly folders = new Map<string, Readonly<Record<string, string>>>();

  /** Gives the run folder (or, without a run key, the project folder) these files. */
  seed(target: FolderTarget, files: Readonly<Record<string, string>>): void {
    this.folders.set(pathOf(target), files);
  }

  /** True while the folder, or one inside it, holds files. */
  has(target: FolderTarget): boolean {
    return this.paths(target).length > 0;
  }

  size(target: FolderTarget): Promise<number> {
    const sizes = this.paths(target).map((path) => byteLength(this.folders.get(path) ?? {}));
    return Promise.resolve(sizes.reduce((sum, bytes) => sum + bytes, 0));
  }

  remove(target: FolderTarget): Promise<void> {
    this.removals.push(target);
    for (const path of this.paths(target)) this.folders.delete(path);
    return Promise.resolve();
  }

  /** The folder itself and everything below it. */
  private paths(target: FolderTarget): string[] {
    const own = pathOf(target);
    return [...this.folders.keys()].filter((path) => path === own || path.startsWith(`${own}/`));
  }
}
