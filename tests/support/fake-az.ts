import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// P1-184: a stand-in for the az CLI in workflow step tests, as shell functions put before the step
// script. Every call is logged; `job start` answers an execution name; each `job execution show`
// answers the next of the given end states; sleep returns at once. Nothing reaches Azure.

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

const prelude = [
  'az() {',
  `  printf '%s\\n' "$*" >> "$FAKE_AZ_LOG"`,
  '  case "$*" in',
  '    *"job start"*) echo rosetta-migrate-exec1 ;;',
  '    *"execution show"*)',
  '      n=$(( $(cat "$FAKE_AZ_COUNT" 2> /dev/null || echo 0) + 1 ))',
  '      echo "$n" > "$FAKE_AZ_COUNT"',
  `      printf '%s\\n' "$FAKE_AZ_STATUSES" | cut -d ' ' -f "$n" ;;`,
  '  esac',
  '}',
  'sleep() { :; }',
].join('\n');

/** A fake az whose migrate execution reports `statuses` (space separated) one poll at a time. */
export async function fakeAz(statuses: string): Promise<FakeAz> {
  const folder = (await mkdtemp(join(tmpdir(), 'rosetta-fake-az-'))).replaceAll('\\', '/');
  const log = `${folder}/calls.log`;
  return {
    folder,
    prelude,
    env: { FAKE_AZ_LOG: log, FAKE_AZ_COUNT: `${folder}/count`, FAKE_AZ_STATUSES: statuses },
    calls: async () =>
      (await readFile(log, 'utf8').catch(() => '')).split('\n').filter((line) => line !== ''),
    dispose: () => rm(folder, { recursive: true, force: true }),
  };
}
