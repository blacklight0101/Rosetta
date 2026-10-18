// RF-1306: one backup run. The dump is written under a partial name and renamed when it is
// complete, so a failed dump never counts and never causes a prune.
import { cp, mkdir, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { dataFolderName, dumpFileName } from './names.js';
import { dataCopyDue, namesToPrune } from './retention.js';

const PARTIAL = '.partial';

export interface BackupOptions {
  readonly now: Date;
  readonly backupDir: string;
  readonly dataDir: string;
  readonly dumpDatabase: (destination: string) => Promise<void>;
  readonly log: (line: string) => void;
}

export interface BackupResult {
  readonly dump: string;
  readonly dataCopy: string | null;
  readonly pruned: readonly string[];
}

/** The real path of `path`, also when the end of it does not exist yet. */
async function realPathOf(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    const parent = dirname(absolute);
    if (!missing || parent === absolute) throw error;
    return join(await realPathOf(parent), basename(absolute));
  }
}

function isSameOrInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (path.split(sep)[0] !== '..' && !isAbsolute(path));
}

async function refuseOverlap(backupDir: string, dataDir: string): Promise<void> {
  const backups = await realPathOf(backupDir);
  const data = await realPathOf(dataDir);
  if (isSameOrInside(data, backups) || isSameOrInside(backups, data)) {
    throw new Error('The backup folder and the data folder must not be inside one another.');
  }
}

async function removePartials(backupDir: string): Promise<void> {
  for (const name of await readdir(backupDir)) {
    if (name.startsWith('rosetta-') && name.endsWith(PARTIAL)) {
      await rm(join(backupDir, name), { recursive: true, force: true });
    }
  }
}

async function writeDump(options: BackupOptions, name: string): Promise<number> {
  const partial = join(options.backupDir, `${name}${PARTIAL}`);
  try {
    await options.dumpDatabase(partial);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  const final = join(options.backupDir, name);
  await rename(partial, final);
  return (await stat(final)).size;
}

async function copyData(options: BackupOptions, name: string): Promise<void> {
  const partial = join(options.backupDir, `${name}${PARTIAL}`);
  try {
    await cp(options.dataDir, partial, { recursive: true });
  } catch (error) {
    await rm(partial, { recursive: true, force: true });
    throw error;
  }
  const final = join(options.backupDir, name);
  await rm(final, { recursive: true, force: true });
  await rename(partial, final);
}

export async function runBackup(options: BackupOptions): Promise<BackupResult> {
  const { now, backupDir, dataDir, log } = options;
  await refuseOverlap(backupDir, dataDir);
  await stat(dataDir);
  await mkdir(backupDir, { recursive: true });
  await removePartials(backupDir);

  const dump = dumpFileName(now);
  log(`Database dump written: ${dump} (${String(await writeDump(options, dump))} bytes)`);

  let dataCopy: string | null = null;
  if (dataCopyDue(await readdir(backupDir), now)) {
    dataCopy = dataFolderName(now);
    await copyData(options, dataCopy);
    log(`Data folder copied: ${dataCopy}`);
  }

  const pruned = namesToPrune(await readdir(backupDir), now);
  for (const name of pruned) {
    await rm(join(backupDir, name), { recursive: true, force: true });
    log(`Pruned: ${name}`);
  }
  return { dump, dataCopy, pruned };
}
