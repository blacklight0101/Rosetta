// RF-1306: one restore run. Every check happens before anything is changed: a database that
// already has tables and a data folder that is not empty are left alone unless `force` is set.
import { cp, readdir, stat } from 'node:fs/promises';

export interface RestoreOptions {
  readonly dumpFile: string;
  readonly dataSource?: string | undefined;
  readonly dataTarget?: string | undefined;
  readonly force: boolean;
  readonly countTables: () => Promise<number>;
  readonly restoreDatabase: (dumpFile: string, replace: boolean) => Promise<void>;
  readonly log: (line: string) => void;
}

export interface RestoreResult {
  readonly databaseRestored: boolean;
  readonly dataRestored: boolean;
}

export class RestoreRefused extends Error {}

async function isEmptyFolder(path: string): Promise<boolean> {
  try {
    return (await readdir(path)).length === 0;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return true;
    throw error;
  }
}

async function requireFile(path: string): Promise<void> {
  const found = await stat(path).then(
    (info) => info.isFile(),
    () => false,
  );
  if (!found) throw new RestoreRefused('The database dump to restore was not found.');
}

export async function runRestore(options: RestoreOptions): Promise<RestoreResult> {
  const { dumpFile, dataSource, dataTarget, force, countTables, restoreDatabase, log } = options;
  await requireFile(dumpFile);
  const tables = await countTables();
  if (tables > 0 && !force) {
    throw new RestoreRefused(
      `The database already has ${String(tables)} tables. Restore into an empty database, or pass --force to replace its content.`,
    );
  }
  const copyBack = dataSource !== undefined && dataTarget !== undefined;
  if (copyBack && !force && !(await isEmptyFolder(dataTarget))) {
    throw new RestoreRefused(
      'The data folder is not empty. Restore into an empty folder, or pass --force to merge into it.',
    );
  }
  await restoreDatabase(dumpFile, tables > 0);
  log('Database restored.');
  if (copyBack) {
    await cp(dataSource, dataTarget, { recursive: true });
    log('Data folder restored.');
  }
  return { databaseRestored: true, dataRestored: copyBack };
}
