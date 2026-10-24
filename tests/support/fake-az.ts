import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// P1-184: a stand-in for the az CLI in workflow step tests, as shell functions put before the step
// script. Every call is logged; `job start` answers an execution name; each `job execution show`
// answers the next of the given end states; `secret show` answers a database URL of the role the
// secret belongs to; a plain `show` fails when the fake is told every resource is missing; sleep
// returns at once. Nothing reaches Azure.

export interface FakeAz {
  /** The shell functions to put before the step script. */
  readonly prelude: string;
  /** The folder of the log, free for the test's own files. */
  readonly folder: string;
  /** The environment the functions read. */
  readonly env: Readonly<Record<string, string>>;
  /** The az command lines the step ran, in order. */
  calls(): Promise<string[]>;
  dispose(): Promise<void>;
}

export interface FakeAzOptions {
  /** End states of the migrate execution, one per poll. */
  readonly statuses?: string;
  /** When true, every `show` of a resource fails, as before the first provisioning. */
  readonly missing?: boolean;
}

/** The database URLs the fake `secret show` answers (the passwords are `app-old` and `migrator-old`). */
export const storedUrls = {
  app: 'postgres://rosetta_app:app-old@old.postgres.database.azure.com:5432/rosetta?sslmode=require',
  migrator:
    'postgres://rosetta_migrator:migrator-old@old.postgres.database.azure.com:5432/rosetta?sslmode=require',
};

const prelude = [
  'az() {',
  `  printf '%s\\n' "$*" >> "$FAKE_AZ_LOG"`,
  '  case "$*" in',
  '    *"job start"*) echo rosetta-migrate-exec1 ;;',
  '    *"execution show"*)',
  '      n=$(( $(< "$FAKE_AZ_COUNT") + 1 ))',
  '      echo "$n" > "$FAKE_AZ_COUNT"',
  `      printf '%s\\n' "$FAKE_AZ_STATUSES" | cut -d ' ' -f "$n" ;;`,
  `    *"--secret-name database-url"*) printf '%s\\n' "$FAKE_AZ_APP_URL" ;;`,
  `    *"--secret-name database-migrator-url"*) printf '%s\\n' "$FAKE_AZ_MIGRATOR_URL" ;;`,
  '    *" show "*) [ "$FAKE_AZ_MISSING" != true ] ;;',
  '  esac',
  '}',
  'sleep() { :; }',
].join('\n');

/** A fake az; see the header for what each kind of call answers. */
export async function fakeAz(options: FakeAzOptions = {}): Promise<FakeAz> {
  const folder = (await mkdtemp(join(tmpdir(), 'rosetta-fake-az-'))).replaceAll('\\', '/');
  const log = `${folder}/calls.log`;
  const count = `${folder}/count`;
  await writeFile(count, '0');
  return {
    folder,
    prelude,
    env: {
      FAKE_AZ_LOG: log,
      FAKE_AZ_COUNT: count,
      FAKE_AZ_STATUSES: options.statuses ?? 'Succeeded',
      FAKE_AZ_MISSING: options.missing === true ? 'true' : 'false',
      FAKE_AZ_APP_URL: storedUrls.app,
      FAKE_AZ_MIGRATOR_URL: storedUrls.migrator,
    },
    calls: async () =>
      (await readFile(log, 'utf8').catch(() => '')).split('\n').filter((line) => line !== ''),
    dispose: () => rm(folder, { recursive: true, force: true }),
  };
}
