import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// DEC-175: a stand-in for the gh CLI and for date in workflow step tests (scheduled-release.yml and
// the staging check of release.yml), as shell functions put before the step script. Every gh call
// is logged; `api .../commits/main` answers the head SHA of main, `api .../commits/<sha>` with
// `committer.date` answers the merge time of that commit, `run list` answers the number of matching
// Release runs, `api .../check-runs` answers a check conclusion, `workflow run` succeeds. `date +%H`
// and `date '+%F %H'` answer the given hour (or the given instant) and logs the TZ it was called with; every other date call is the real date,
// so the step can compare instants. Nothing reaches GitHub.

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
  /** The committer date (ISO 8601, UTC) the head commit of main answers. */
  readonly committed?: string;
  /**
   * The instant (ISO 8601, UTC) every `date` call without `-d` answers, converted by the real date
   * with the TZ of the call, so DST and the 06:00 boundary are real. Unset: the real clock, and the
   * hour answered by `hour`.
   */
  readonly now?: string;
  /** How many `run list` calls after a `workflow run` still answer 0 (GitHub lists a run late). */
  readonly listLag?: number;
}

const prelude = [
  'gh() {',
  `  printf '%s\\n' "$*" >> "$FAKE_GH_LOG"`,
  '  case "$*" in',
  `    *"committer.date"*) printf '%s\\n' "$FAKE_GH_COMMITTED" ;;`,
  `    *"commits/main"*) printf '%s\\n' "$FAKE_GH_MAIN_SHA" ;;`,
  `    *"run list"*)`,
  `      if grep -q '^workflow run' "$FAKE_GH_LOG"; then`,
  `        n="$(cat "$FAKE_GH_LOG.lag" 2>/dev/null || echo 0)"`,
  `        if [ "$n" -lt "$FAKE_GH_LAG" ]; then echo $((n + 1)) > "$FAKE_GH_LOG.lag"; echo 0; else echo 1; fi`,
  `      else printf '%s\\n' "$FAKE_GH_ACTIVE"; fi ;;`,
  `    *"check-runs"*) printf '%s\\n' "$FAKE_GH_CONCLUSION" ;;`,
  '  esac',
  '}',
  'sleep() { :; }',
  // Git Bash on Windows has no zoneinfo, so Europe/Madrid is its POSIX rule (the EU rule, the same instants).
  `tzdate() { if [ "\${TZ:-}" = Europe/Madrid ]; then TZ='CET-1CEST,M3.5.0,M10.5.0/3' command date "$@"; else command date "$@"; fi; }`,
  'date() {',
  '  case "$*" in',
  `    *"%F %H"*) printf '%s\\n' "\${TZ:-}" >> "$FAKE_DATE_LOG"`,
  `      if [ -n "$FAKE_NOW" ]; then tzdate -d "$FAKE_NOW" "$@"; else printf '%s %s\\n' "$(tzdate +%F)" "$FAKE_HOUR"; fi ;;`,
  `    *"+%H"*) printf '%s\\n' "\${TZ:-}" >> "$FAKE_DATE_LOG"; printf '%s\\n' "$FAKE_HOUR" ;;`,
  '    *" -d "*) tzdate "$@" ;;',
  `    *) if [ -n "$FAKE_NOW" ]; then tzdate -d "$FAKE_NOW" "$@"; else tzdate "$@"; fi ;;`,
  '  esac',
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
      FAKE_GH_COMMITTED: options.committed ?? '2000-01-01T00:00:00Z',
      FAKE_NOW: options.now ?? '',
      FAKE_GH_LAG: String(options.listLag ?? 0),
    },
    calls: () => lines(log),
    zones: () => lines(dates),
    dispose: () => rm(folder, { recursive: true, force: true }),
  };
}
