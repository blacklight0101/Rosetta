import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, pipeline } from 'node:stream';
import { ZipFile } from 'yazl';
import type {
  ArchivePart,
  ArchiveRefusal,
  ArchiveWriter,
} from '../../application/ports/archive-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { isOwnFile, isRealFolder, runFolderOf } from './run-folder.js';

// RF-008, RF-1105, RF-005, data-model.md section 2: the zip of a run folder, written while it is
// read (yazl pulls one file at a time and the stream stops at its buffer, so a run of any size
// never sits in memory). Only the owner's run folder is read: the folder, and every folder on the
// way to it, must be the real one (a link anywhere on the path refuses the archive), and inside it
// a link, a file with several hard links (it may be a file from elsewhere) and anything that is
// not a plain file or folder is left out. Names come from the folder, sorted, never from a request.

const HANDOFF_FOLDER = 'handoff';

/**
 * RF-508, P2-53: a file that is already minified (`*.min.js`, such as the 5.5 MB vendored
 * `mermaid.min.js`) gains little from deflate and costs seconds of CPU while the request waits
 * for the zip (5 to 7 s on Windows, P2-50), so it is stored. Every other file is deflated.
 */
const MINIFIED_SUFFIX = '.min.js';

/**
 * RF-505: the zips the report writes into its own folder (`report/<name>.zip`, and the file a zip
 * is written to until it is whole). They are left out of the archive of the run, so a zip never
 * holds an earlier one.
 */
const REPORT_ZIP = /^report\/[^/]+\.zip(\.part)?$/u;

/** Where the part lives, as the data folder's real path plus the names Rosetta builds from ids. */
function locate(realData: string, scope: RunScope, part: ArchivePart): string | undefined {
  const run = runFolderOf(realData, scope);
  return run === undefined || part !== 'handoff' ? run : join(run, HANDOFF_FOLDER);
}

function byName(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Where a folder sits in the archive (`prefix`, ending in `/`) and in the run folder (`inRun`). */
interface Place {
  readonly prefix: string;
  readonly inRun: string;
}

/** Adds the folder's contents at `place`; folders get their own entry. */
async function addFolder(zip: ZipFile, folder: string, place: Place): Promise<void> {
  const entries = await readdir(folder, { withFileTypes: true });
  entries.sort((left, right) => byName(left.name, right.name));
  for (const entry of entries) {
    const path = join(folder, entry.name);
    // A backslash in a name cannot be told from a separator by some unzip tools.
    if (entry.isSymbolicLink() || entry.name.includes('\\')) continue;
    if (entry.isDirectory()) {
      zip.addEmptyDirectory(`${place.prefix}${entry.name}/`);
      await addFolder(zip, path, {
        prefix: `${place.prefix}${entry.name}/`,
        inRun: `${place.inRun}${entry.name}/`,
      });
    } else if (
      entry.isFile() &&
      !REPORT_ZIP.test(`${place.inRun}${entry.name}`) &&
      (await isOwnFile(path))
    ) {
      zip.addFile(path, `${place.prefix}${entry.name}`, {
        compress: !entry.name.endsWith(MINIFIED_SUFFIX),
      });
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
      const handoff = part === 'handoff';
      await addFolder(zip, folder, {
        prefix: handoff ? `${HANDOFF_FOLDER}/` : `${scope.runKey}/`,
        inRun: handoff ? `${HANDOFF_FOLDER}/` : '',
      });
    } catch (error) {
      stream.destroy();
      throw error;
    }
    zip.end();
    return ok(stream);
  }
}
