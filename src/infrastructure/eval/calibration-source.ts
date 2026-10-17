import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { Logger } from '../../application/ports/logger.js';
import type { RepositoryReader } from '../../application/ports/repository-reader.js';
import type { SkipLookup } from '../../application/verifier/cited-lines.js';
import type { SkipReason } from '../../domain/code-map/file-entry.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { NodeRepositoryReader } from '../files/node-repository-reader.js';
import { isBinary } from '../scan/universal/binary-detect.js';

// RF-305, RF-005, ADR-006: the files a calibration set cites are a folder of the Rosetta repository
// (a fixture), opened read-only through the same reader the agents use, so an ignored or denied file
// is refused as it is for them. The folder is resolved against the repository root after links are
// followed, so a link out of the repository is refused.

function inside(root: string, path: string): boolean {
  const below = relative(root, path);
  return below !== '' && below !== '..' && !below.startsWith(`..${sep}`) && !isAbsolute(below);
}

/**
 * RF-100, P2-39: the files among `paths` that the scan would have skipped, a binary file or one above
 * `maxFileBytes`. The judgement never reads or sends them: it gets their path and a note instead,
 * as a run's verifier does for a file the scan skipped. A file that cannot be read is not listed
 * here; reading its lines is refused later.
 */
// RF-305
export async function skipLookupOf(
  reader: RepositoryReader,
  paths: readonly string[],
  maxBytes: number,
): Promise<SkipLookup> {
  const skipped = new Map<string, SkipReason>();
  for (const path of new Set(paths)) {
    const read = await reader.readBytes({ path, maxBytes });
    if (!read.ok) continue;
    if (read.value.bytes === undefined) skipped.set(path, 'too-large');
    else if (isBinary(read.value.bytes)) skipped.set(path, 'binary');
  }
  return (path) => skipped.get(path);
}

// RF-305
export async function openCalibrationSource(
  repositoryRoot: string,
  folder: string,
  logger: Logger,
): Promise<Result<RepositoryReader, string>> {
  try {
    const root = await realpath(repositoryRoot);
    const source = await realpath(join(root, ...folder.split('/')));
    if (!inside(root, source))
      return err(`The calibration source ${folder} is outside the repository.`);
    const reader = await NodeRepositoryReader.open({
      root: source,
      ignoreRules: '',
      allowDenied: [],
      logger,
    });
    return ok(reader);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return err(`The calibration source ${folder} cannot be opened: ${reason}`);
  }
}
