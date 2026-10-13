import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, pipeline } from 'node:stream';
import { ZipFile } from 'yazl';
import type {
  ArchivePart,
  ArchiveRefusal,
  ArchiveWriter,
} from '../../application/ports/archive-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { isRealFolder } from './real-folder.js';
import { runPath, workspaceRoot } from './workspace-paths.js';

// RF-008, RF-1105, RF-005, data-model.md section 2: the zip of a run folder, written while it is
// read (yazl pulls one file at a time and the stream stops at its buffer, so a run of any size
// never sits in memory). Only the owner's run folder is read: the folder, and every folder on the
// way to it, must be the real one (a link anywhere on the path refuses the archive), and inside it
// a link, a file with several hard links (it may be a file from elsewhere) and anything that is
// not a plain file or folder is left out. Names come from the folder, sorted, never from a request.

const HANDOFF_FOLDER = 'handoff';

/** Where the part lives, as the data folder's real path plus the names Rosetta builds from ids. */
function locate(realData: string, scope: RunScope, part: ArchivePart): string | undefined {
  try {
    const run = join(
      workspaceRoot(realData, scope.userId),
      ...runPath(scope.projectId, scope.runKey).split('/'),
    );
    return part === 'handoff' ? join(run, HANDOFF_FOLDER) : run;
  } catch (error) {
    // An id that is not an id has no folder; any other failure is not ours to hide.
    if (error instanceof RosettaError) return undefined;
    throw error;
  }
}

function byName(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Whether the file may enter the archive: a plain file nobody else holds a second name for. */
async function isOwnFile(path: string): Promise<boolean> {
  const info = await lstat(path);
  return info.isFile() && info.nlink === 1;
}

/** Adds the folder's contents under `prefix` (ending in `/`); folders get their own entry. */
async function addFolder(zip: ZipFile, folder: string, prefix: string): Promise<void> {
  const entries = await readdir(folder, { withFileTypes: true });
  entries.sort((left, right) => byName(left.name, right.name));
  for (const entry of entries) {
    const path = join(folder, entry.name);
    // A backslash in a name cannot be told from a separator by some unzip tools.
    if (entry.isSymbolicLink() || entry.name.includes('\\')) continue;
    if (entry.isDirectory()) {
      zip.addEmptyDirectory(`${prefix}${entry.name}/`);
      await addFolder(zip, path, `${prefix}${entry.name}/`);
    } else if (entry.isFile() && (await isOwnFile(path))) {
      zip.addFile(path, `${prefix}${entry.name}`);
    }
  }
}

/** The archive as a stream; a failure of the zip or of a file destroys it with that error. */
function streamOf(zip: ZipFile): PassThrough {
  const out = new PassThrough();
  pipeline(zip.outputStream, out, () => undefined);
  zip.on('error', (error: unknown) => {
    out.destroy(error instanceof Error ? error : new Error('The archive could not be written'));
  });
  return out;
}

export class YazlArchiveWriter implements ArchiveWriter {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  // RF-008, RF-1105
  async archive(
    scope: RunScope,
    part: ArchivePart,
  ): Promise<Result<AsyncIterable<Uint8Array>, ArchiveRefusal>> {
    const realData = await realpath(this.dataDir).catch(() => undefined);
    const folder = realData === undefined ? undefined : locate(realData, scope, part);
    if (folder === undefined || !(await isRealFolder(folder))) return err('not-found');
    const zip = new ZipFile();
    const stream = streamOf(zip);
    try {
      await addFolder(zip, folder, part === 'handoff' ? `${HANDOFF_FOLDER}/` : `${scope.runKey}/`);
    } catch (error) {
      stream.destroy();
      throw error;
    }
    zip.end();
    return ok(stream);
  }
}
