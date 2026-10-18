import { join } from 'node:path';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { checkRepositoryPath } from './repository-path.js';

// RF-005, RF-1105, data-model sections 2 and 6: workspace paths are built from ids, never from
// request text, and every name inside a workspace is a plain file name.

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const runId = /^\d{8}-\d{6}-[a-z]+(?:-\d+)?$/;
// Names are at most 100 characters and paths at most 200, well inside every file system's limits
// once `<data>/users/<userId>/` is added, so an over-long name is refused instead of failing in fs.
const plainSegment = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;
const maxPathLength = 200;

function requireId(value: string, shape: RegExp): string {
  if (!shape.test(value)) throw new RosettaError(ERROR_CODES.workspaceIdInvalid);
  return value;
}

/** Whether the text is the folder name of a run (`20261012-100000-understand`). */
export function isRunKey(value: string): boolean {
  return runId.test(value);
}

export function isUserId(value: string): boolean {
  return uuid.test(value);
}

/** `<data>/users/<userId>`: the only folder a user's output is written to. */
export function workspaceRoot(dataDir: string, userId: string): string {
  return join(dataDir, 'users', requireId(userId, uuid));
}

/** `<data>/sources`: the shared snapshot cache, written only by the fetcher. */
export function snapshotCacheRoot(dataDir: string): string {
  return join(dataDir, 'sources');
}

/** `projects/<projectId>`, relative to the workspace. */
export function projectPath(projectId: string): string {
  return `projects/${requireId(projectId, uuid)}`;
}

/**
 * `projects/<projectId>/plan-options`, relative to the workspace: the logs of the model calls a
 * project makes outside any run. It lies inside the project folder, so it goes with the project.
 */
export function planOptionsPath(projectId: string): string {
  return `${projectPath(projectId)}/plan-options`;
}

/** `projects/<projectId>/runs/<runId>`, relative to the workspace. */
export function runPath(projectId: string, run: string): string {
  return `${projectPath(projectId)}/runs/${requireId(run, runId)}`;
}

export type WorkspacePathProblem = 'outside-workspace' | 'invalid-path';

/** Checks a workspace-relative path: no traversal, and only plain names in every segment. */
export function checkWorkspacePath(path: string): Result<string, WorkspacePathProblem> {
  const checked = checkRepositoryPath(path);
  if (!checked.ok)
    return err(checked.error === 'outside-root' ? 'outside-workspace' : 'invalid-path');
  return path.length <= maxPathLength &&
    path.split('/').every((segment) => plainSegment.test(segment))
    ? ok(path)
    : err('invalid-path');
}

/** Whether the text is the id of a project (the name of its folder). */
export function isProjectId(value: string): boolean {
  return uuid.test(value);
}
