// RF-1306: the command line of `npm run backup` and `npm run restore`. Settings come from the
// environment; the only flags are --dump, --data-copy, --data-target and --force for a restore.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runBackup } from './backup-run.js';
import { newestName } from './retention.js';
import { buildInvocation, parseDatabaseUrl, runTool } from './postgres.js';
import { runRestore } from './restore-run.js';

export interface CliSettings {
  readonly url: string;
  readonly container: string | undefined;
  readonly backupDir: string;
  readonly secrets: readonly string[];
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') throw new Error(`Set ${name} in the environment.`);
  return value;
}

function settingsFrom(env: NodeJS.ProcessEnv): CliSettings {
  const url = required(env, 'ROSETTA_BACKUP_DATABASE_URL');
  const container = env['ROSETTA_BACKUP_DB_CONTAINER'];
  return {
    url,
    container: container === '' ? undefined : container,
    backupDir: required(env, 'ROSETTA_BACKUP_DIR'),
    secrets: [parseDatabaseUrl(url).password],
  };
}

function tool(settings: CliSettings, name: string, args: readonly string[]) {
  const invocation = buildInvocation({
    url: settings.url,
    container: settings.container,
    tool: name,
    args,
  });
  return { invocation, secrets: settings.secrets };
}

const COUNT_TABLES =
  "select count(*) from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')";

export async function backupMain(
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): Promise<void> {
  const settings = settingsFrom(env);
  const dataDir = required(env, 'ROSETTA_DATA_DIR');
  await runBackup({
    now: new Date(),
    backupDir: settings.backupDir,
    dataDir,
    log,
    dumpDatabase: async (destination) => {
      const call = tool(settings, 'pg_dump', ['--format=custom', '--no-password']);
      await runTool({ ...call, stdout: destination });
    },
  });
}

export interface RestoreFlags {
  readonly dump: string | undefined;
  readonly dataCopy: string | undefined;
  readonly dataTarget: string | undefined;
  readonly force: boolean;
}

const VALUE_FLAGS = ['--dump', '--data-copy', '--data-target'];

export function parseFlags(argv: readonly string[]): RestoreFlags {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    if (flag === '--force') continue;
    const value = argv[index + 1];
    if (!VALUE_FLAGS.includes(flag) || value === undefined || value.startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${flag}`);
    }
    values.set(flag, value);
    index += 1;
  }
  return {
    dump: values.get('--dump'),
    dataCopy: values.get('--data-copy'),
    dataTarget: values.get('--data-target'),
    force: argv.includes('--force'),
  };
}

export async function chooseBackups(
  backupDir: string,
  flags: RestoreFlags,
): Promise<{ dumpFile: string; dataSource?: string }> {
  const names = await readdir(backupDir);
  const dump = flags.dump ?? newestName(names, 'db');
  if (dump === null) throw new Error('No database dump found in the backup folder.');
  const copy =
    flags.dataTarget === undefined ? null : (flags.dataCopy ?? newestName(names, 'data'));
  if (flags.dataTarget !== undefined && copy === null) {
    throw new Error('No data folder copy found in the backup folder.');
  }
  return {
    dumpFile: join(backupDir, dump),
    ...(copy === null ? {} : { dataSource: join(backupDir, copy) }),
  };
}

export async function restoreMain(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): Promise<void> {
  const settings = settingsFrom(env);
  const flags = parseFlags(argv);
  const chosen = await chooseBackups(settings.backupDir, flags);
  await runRestore({
    ...chosen,
    dataTarget: flags.dataTarget,
    force: flags.force,
    log,
    countTables: async () => {
      const call = tool(settings, 'psql', ['-X', '-A', '-t', '-c', COUNT_TABLES]);
      return parseTableCount(await runTool(call));
    },
    restoreDatabase: async (dumpFile, replace) => {
      const extra = replace ? ['--clean', '--if-exists'] : [];
      const call = tool(settings, 'pg_restore', ['--no-password', '--exit-on-error', ...extra]);
      await runTool({ ...call, stdin: dumpFile });
    },
  });
}

export function parseTableCount(text: string): number {
  const digits = text.trim();
  if (!/^\d+$/u.test(digits)) {
    throw new Error('The database table count could not be read; nothing was restored.');
  }
  return Number.parseInt(digits, 10);
}
