import type { FolderTarget, WorkspaceFolders } from '../../application/ports/workspace-folders.js';

// RF-1012, RF-005: stub, replaced by the implementation in the next commit.

export class NodeWorkspaceFolders implements WorkspaceFolders {
  constructor(dataDir: string) {
    void dataDir;
  }

  size(target: FolderTarget): Promise<number> {
    void target;
    return Promise.resolve(0);
  }

  remove(target: FolderTarget): Promise<void> {
    void target;
    return Promise.resolve();
  }
}
