import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// DEC-175: a stand-in for the gh CLI and for date in workflow step tests (scheduled-release.yml and
// the staging check of release.yml), as shell functions put before the step script. Every gh call
// is logged; `api .../commits/main` answers the head SHA of main, `run list` answers the number of
// matching Release runs, `api .../check-runs` answers a check conclusion, `workflow run` succeeds.
// `date` answers the given hour and logs the TZ it was called with. Nothing reaches GitHub.

export interface FakeGh {
  /** The shell functions to put before the step script. */
  readonly prelude: string;
  /** The folder of the logs, free for the test's own files. */
  readonly folder: string;
  /** The environment the functions read. */
  readonly env: Readonly<Record<string, string>>;
  /** The gh command lines the step ran, in order. */
  calls(): Promise<string[]>;
  /** The TZ values date was called with, in order. */
  zones(): Promise<string[]>;
  dispose(): Promise<void>;
}

export interface FakeGhOptions {
  /** The head SHA of main. */
  readonly mainSha?: string;
  /** What `run list` answers: the count of queued, running or successful Release runs. */
  readonly activeRuns?: string;
  /** The conclusion a check-runs lookup answers. */
  readonly conclusion?: string;
  /** The hour `date +%H` answers. */
  readonly hour?: string;
}

const prelude = [
  'gh() {',
  `  printf '%s\\n' "$*" >> "$FAKE_GH_LOG"`,
  '  case "$*" in',
  `    *"commits/main"*) printf '%s\\n' "$FAKE_GH_MAIN_SHA" ;;`,
  `    *"run list"*) printf '%s\\n' "$FAKE_GH_ACTIVE" ;;`,
  `    *"check-runs"*) printf '%s\\n' "$FAKE_GH_CONCLUSION" ;;`,
  '  esac',
  '}',
  'date() {',
  `  printf '%s\\n' "\${TZ:-}" >> "$FAKE_DATE_LOG"`,
  `  printf '%s\\n' "$FAKE_HOUR"`,
  '}',
].join('\n');

const lines = async (path: string): Promise<string[]> =>
  (await readFile(path, 'utf8').catch(() => '')).split('\n').filter((line) => line !== '');

/** A fake gh and date; see the header for what each call answers. */
export async function fakeGh(options: FakeGhOptions = {}): Promise<FakeGh> {
  const folder = (await mkdtemp(join(tmpdir(), 'rosetta-fake-gh-'))).replaceAll('\\', '/');
  const log = `${folder}/gh.log`;
  const dates = `${folder}/date.log`;
  return {
    folder,
    prelude,
    env: {
      FAKE_GH_LOG: log,
      FAKE_DATE_LOG: dates,
      FAKE_GH_MAIN_SHA: options.mainSha ?? 'a'.repeat(40),
      FAKE_GH_ACTIVE: options.activeRuns ?? '0',
      FAKE_GH_CONCLUSION: options.conclusion ?? 'success',
      FAKE_HOUR: options.hour ?? '06',
    },
    calls: () => lines(log),
    zones: () => lines(dates),
    dispose: () => rm(folder, { recursive: true, force: true }),
  };
}
