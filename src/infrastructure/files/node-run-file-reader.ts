import type { BigIntStats } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunScope } from '../../application/ports/run-events.js';
import type { RunFileContent, RunFileReader } from '../../application/ports/run-file-reader.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { isRealFolder, runFolderOf } from './run-folder.js';
import { checkWorkspacePath } from './workspace-paths.js';

// RF-506, RF-1105, RF-005: reads one file of a run folder from the data folder. The path comes from a
// request, so it is checked before the disk is touched (plain relative names only, nothing that
// leaves the folder on any operating system), the run folder must be the real one, and every name
// on the way down is looked at: a link, a file with several hard links (it may be a file from
// elsewhere) and anything that is not a plain file or folder is refused. The file is then opened
// and must be the very file that was looked at, so a swap in between reads nothing.

type Opened = Result<RunFileContent, 'not-found'>;

const notFound: Opened = err('not-found');

/** The names below the run folder; the last must be a plain file, the rest real folders. */
async function plainFileAt(folder: string, names: readonly string[]) {
  let current = folder;
  for (const [position, name] of names.entries()) {
    current = join(current, name);
    const info = await lstat(current, { bigint: true }).catch(() => undefined);
    const last = position === names.length - 1;
    const plain = last
      ? info?.isFile() === true && info.nlink === 1n
      : info?.isDirectory() === true;
    if (info === undefined || info.isSymbolicLink() || !plain) return undefined;
  }
  const info = await lstat(current, { bigint: true });
  return { path: current, info };
}

/** Opens the file and keeps it only when it is the very file that was looked at. */
async function openSame(found: { path: string; info: BigIntStats }): Promise<Opened> {
  const handle = await open(found.path, 'r').catch(() => undefined);
  if (handle === undefined) return notFound;
  const opened = await handle.stat({ bigint: true });
  const same = opened.isFile() && opened.dev === found.info.dev && opened.ino === found.info.ino;
  if (!same || opened.nlink !== 1n) {
    await handle.close();
    return notFound;
  }
  return ok({ size: Number(opened.size), body: handle.createReadStream() });
}

export class NodeRunFileReader implements RunFileReader {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  // RF-506, RF-1105, RF-005
  async open(scope: RunScope, path: string): Promise<Opened> {
    if (!checkWorkspacePath(path).ok) return notFound;
    const realData = await realpath(this.dataDir).catch(() => undefined);
    const folder = realData === undefined ? undefined : runFolderOf(realData, scope);
    if (folder === undefined || !(await isRealFolder(folder))) return notFound;
    const found = await plainFileAt(folder, path.split('/')).catch(() => undefined);
    if (found === undefined) return notFound;
    return openSame(found);
  }
}
