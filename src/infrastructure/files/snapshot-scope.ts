import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '../../application/ports/logger.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { checkRepositoryPath, isInside } from './repository-path.js';

// RF-140, ADR-013: the configured subpath limits a run to one folder of the snapshot. It must be a
// plain path whose every folder is a real folder inside the root: a subpath that is, or passes
// through, a link or junction would let files from outside the snapshot into the index.

async function isLinkFree(root: string, subpath: string): Promise<boolean> {
  let current = root;
  for (const segment of subpath.split('/')) {
    current = join(current, segment);
    const stats = await lstat(current).catch(() => undefined);
    if (stats === undefined) return true;
    if (stats.isSymbolicLink()) return false;
  }
  const real = await realpath(current).catch(() => undefined);
  return real === undefined || isInside(await realpath(root), real);
}

/** The checked subpath ('' for the whole repository); fails closed with a security event. */
export async function checkedScope(
  root: string,
  subpath: string | undefined,
  logger: Logger,
): Promise<string> {
  if (subpath === undefined || subpath === '') return '';
  if (checkRepositoryPath(subpath).ok && (await isLinkFree(root, subpath))) return subpath;
  await logger.securityEvent(ERROR_CODES.pathOutsideRoot, {
    message: 'Repository subpath refused: outside-root.',
    data: { subpath },
  });
  throw new RosettaError(ERROR_CODES.pathOutsideRoot);
}
