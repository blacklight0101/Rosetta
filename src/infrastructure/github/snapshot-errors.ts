import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

/** Node file-system failure codes; anything else that reaches the extractor is a stream failure. */
const FILE_SYSTEM_CODES: ReadonlySet<string> = new Set([
  'EACCES',
  'EBUSY',
  'EDQUOT',
  'EEXIST',
  'EIO',
  'EISDIR',
  'ELOOP',
  'EMFILE',
  'ENAMETOOLONG',
  'ENFILE',
  'ENOENT',
  'ENOSPC',
  'ENOTDIR',
  'ENOTEMPTY',
  'EPERM',
  'EROFS',
]);

/** The `code` of a Node error, when it has one. */
export function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

/** True for an error whose `code` is a Node file-system code (ENOSPC, EACCES, ...). */
export function isFileSystemFailure(error: unknown): boolean {
  return FILE_SYSTEM_CODES.has(errorCode(error) ?? '');
}

/** RST-1908: the snapshot could not be written to or read from the data folder. */
// RF-122
export function snapshotWriteFailed(what: string, cause: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.snapshotWriteFailed, `The snapshot ${what}.`, { cause });
}
