import { createWriteStream } from 'node:fs';
import { mkdir, realpath, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ArchivePart, ArchiveWriter } from '../../application/ports/archive-writer.js';
import type { ReportDownloads } from '../../application/ports/report-downloads.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { ReportDownloadNames } from '../../application/report/report-model.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { runFolderOf } from '../files/run-folder.js';

// RF-505, DEC-24, RF-005: writes the zips "Download all" links into the `report/` folder of the run
// folder: the run zip and, when the report names one, the hand-off zip. The archives are the ones
// of RF-008 (`ArchiveWriter`), so they hold only the owner's real files; a zip is written to a
// `.part` file and renamed when it is whole, so a failure leaves no half-written zip. The names
// come from the run key, but a name with a folder in it is refused all the same.

const FOLDER = 'report';
const PARTIAL = '.part';

/** The zips asked for, as archive parts with their file names. */
function requested(names: ReportDownloadNames): readonly [ArchivePart, string][] {
  const zips: [ArchivePart, string][] = [['run', names.run]];
  if (names.handoff !== undefined) zips.push(['handoff', names.handoff]);
  return zips;
}

export class ReportZipWriter implements ReportDownloads {
  private readonly dataDir: string;
  private readonly archives: ArchiveWriter;

  constructor(dataDir: string, archives: ArchiveWriter) {
    this.dataDir = dataDir;
    this.archives = archives;
  }

  // RF-505
  async write(scope: RunScope, names: ReportDownloadNames): Promise<void> {
    for (const [part, name] of requested(names)) {
      if (name !== basename(name) || !name.endsWith('.zip')) {
        throw new RosettaError(
          ERROR_CODES.reportWriteFailed,
          `The zip name ${name} is not a file name.`,
        );
      }
      await this.writeOne(scope, part, name);
    }
  }

  private async writeOne(scope: RunScope, part: ArchivePart, name: string): Promise<void> {
    const archive = await this.archives.archive(scope, part);
    if (!archive.ok) {
      throw new RosettaError(ERROR_CODES.reportWriteFailed, `The ${part} has nothing to zip.`);
    }
    const target = await this.reportFolder(scope);
    const partial = join(target, `${name}${PARTIAL}`);
    try {
      await pipeline(Readable.from(archive.value), createWriteStream(partial));
      await rename(partial, join(target, name));
    } catch (error) {
      await rm(partial, { force: true });
      throw new RosettaError(ERROR_CODES.reportWriteFailed, undefined, { cause: error });
    }
  }

  /** The `report/` folder of the run, made if it is missing; the run folder is a real folder in the data folder. */
  private async reportFolder(scope: RunScope): Promise<string> {
    const run = runFolderOf(await realpath(this.dataDir), scope);
    if (run === undefined) throw new RosettaError(ERROR_CODES.reportWriteFailed);
    const folder = join(run, FOLDER);
    await mkdir(folder, { recursive: true });
    return folder;
  }
}
