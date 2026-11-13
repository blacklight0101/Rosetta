import type { CheckItem } from '../../application/lab/judge/judge-check-set.js';
import type { Rubric } from '../../application/lab/judge/rubric.js';
import type { Result } from '../../domain/errors/result.js';

// RF-1405: the files of the judge check.

export interface CheckFolders {
  readonly labFolder: string;
  readonly promptsFolder: string;
  readonly evalFolder: string;
  readonly repositoryRoot: string;
}

export interface LoadedCheck {
  readonly items: readonly CheckItem[];
  readonly rubrics: ReadonlyMap<string, Rubric>;
}

// RF-1405
export function loadCheckItems(folders: CheckFolders): Promise<Result<LoadedCheck, string>> {
  return Promise.reject(new Error(`not implemented: ${folders.labFolder}`));
}
