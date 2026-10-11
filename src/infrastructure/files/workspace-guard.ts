import { realpath } from 'node:fs/promises';
import type { WriteRefusal, WriteRefusalReason } from '../../application/ports/output-writer.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { isInside } from './repository-path.js';

// RF-005: the checks and refusal texts of the output writer.

/** Real (link-free) folders the writer compares against. */
export interface WorkspaceRoots {
  readonly data: string;
  readonly sources: string;
  readonly workspace: string;
}

/** A link on the way to a workspace file: into the snapshot cache, or anywhere else. */
export async function linkProblem(
  path: string,
  roots: WorkspaceRoots,
): Promise<WriteRefusalReason> {
  const target = await realpath(path).catch(() => undefined);
  return target !== undefined && isInside(roots.sources, target)
    ? 'snapshot-cache'
    : 'outside-workspace';
}

const refusals: Readonly<Record<WriteRefusalReason, { code: ErrorCode; message: string }>> = {
  'outside-workspace': {
    code: ERROR_CODES.writeOutsideWorkspace,
    message: 'The file would be outside the user workspace, so the operation was refused.',
  },
  'invalid-path': {
    code: ERROR_CODES.pathInvalid,
    message: 'Workspace paths use plain names of letters, digits, dots, dashes and underscores.',
  },
  'snapshot-cache': {
    code: ERROR_CODES.snapshotWriteRefused,
    message: 'The snapshot cache is read-only, so the write was refused.',
  },
  'not-found': {
    code: ERROR_CODES.fileNotFound,
    message: 'There is no such file in the workspace.',
  },
};

export function writeRefusal(reason: WriteRefusalReason): WriteRefusal {
  return { reason, ...refusals[reason] };
}
