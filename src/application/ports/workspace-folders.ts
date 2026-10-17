// Architecture section 7 (`WorkspaceFolders`), RF-1012, RF-005, data-model.md section 2: the size
// and the removal of the folders of a user's workspace, a project folder or one run folder of it.
// A target is named by ids, never by a path from a request. P1-152: `list` names the folders that
// exist, for the sweep of folders whose rows are gone.

/** `projects/<projectId>` of the user's workspace, or `runs/<runKey>` inside it when `runKey` is given. */
export interface FolderTarget {
  readonly userId: string;
  readonly projectId: string;
  readonly runKey?: string;
}

/** A folder that exists below the data folder and the instant it was last changed (epoch ms). */
export interface ListedFolder {
  readonly target: FolderTarget;
  readonly modifiedAt: number;
}

export interface WorkspaceFolders {
  /**
   * Every project folder and run folder of every user's workspace whose names are ids, a project
   * folder before its run folders. A link is never followed and never listed; a missing data
   * folder lists nothing.
   */
  list(): Promise<readonly ListedFolder[]>;
  /** The bytes the folder holds; 0 for a folder that does not exist. Links are not followed. */
  size(target: FolderTarget): Promise<number>;
  /** Removes the folder and everything in it; a folder that does not exist is not an error. */
  remove(target: FolderTarget): Promise<void>;
}
