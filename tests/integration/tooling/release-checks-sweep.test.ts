import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { at, keysOf, runStep, stepScript, workflowDocument } from '../../support/workflow-yaml.js';

// RF-1304, DEC-207, DEC-227, P8-141: the release checks start when CI completes on a push to main,
// so a CI run that never completes, an event GitHub drops or a lost runner would leave no
// release/ready. The job `sweep` of release-checks.yml, started every hour, walks the first-parent
// history of main for the last 24 hours (scripts/release-checks-sweep.sh) and, for a merge with no
// release/ready, records failure and comments on "Production deploys": when zap-baseline had not
// finished 40 minutes after the merge, or had finished but nothing was recorded 2 hours after it.
// The script runs with bash against a fake gh; nothing reaches GitHub.

const checks = (): Promise<unknown> => workflowDocument('release-checks.yml');
const root = useTempRoot('rosetta-release-sweep-');
const repoName = 'blacklight0101/Rosetta';
const runUrl = 'https://github.com/blacklight0101/Rosetta/actions/runs/7';
const name = 'Record release/ready on a release merge whose checks did not finish';
const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);
const d = 'd'.repeat(40);

/** One commit of main in the fake world. */
interface Merge {
  readonly sha: string;
  /** Minutes since the merge. */
  readonly minutes: number;
  readonly parent: string;
  /** How many release/ready statuses the commit has. */
  readonly recorded: number;
  /** The status of zap-baseline on the commit (`missing` when it has none). */
  readonly zap: string;
  /** The page of the commit's statuses (100 a page) its release/ready statuses are on. */
  readonly page: 1 | 2;
}

/**
 * A fake gh, exported so it also answers inside the scripts the sweep starts. It answers from the
 * world file: `sha date parent recorded zap page` per line. The statuses come in two pages, the
 * second only with `--paginate`; `FAKE_COMMENT_FAILS` makes the owner comment fail.
 */
const prelude = [
  'statuses() {',
  '  recorded="$(world 4 "$1")"; page="$(world 6 "$1")"',
  `  if [ "$page" = 2 ]; then echo 0; else echo "$recorded"; fi`,
  `  case "$1" in *--paginate*) if [ "$page" = 2 ]; then echo "$recorded"; else echo 0; fi ;; esac`,
  '}',
  'world() {',
  `  sha="$(printf '%s' "$2" | sed 's#.*/commits/\\([0-9a-f]*\\).*#\\1#')"`,
  `  awk -v sha="$sha" -v field="$1" '$1 == sha { if (field == 0) print $2, ($3 == "-" ? "" : $3); else print $field }' "$FAKE_WORLD"`,
  '}',
  'gh() {',
  `  printf '%s\\n' "$*" >> "$GH_LOG"`,
  '  case "$*" in',
  `    *'commits/main --jq'*) printf '%s\\n' "$FAKE_HEAD" ;;`,
  `    *'--method POST'*) ;;`,
  `    'issue list'*) printf '12\\tProduction deploys\\n' ;;`,
  `    'issue comment'*) [ -z "\${FAKE_COMMENT_FAILS:-}" ] ;;`,
  `    'issue '*) ;;`,
  `    *'/statuses?'*) statuses "$*" ;;`,
  `    *'/check-runs?'*) world 5 "$*" ;;`,
  `    *'/commits/'*) world 0 "$*" ;;`,
  '  esac',
  '}',
  'export -f gh world statuses',
].join('\n');

/** An ISO 8601 UTC instant `minutes` ago. */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

/** Runs the sweep step against the world; returns its code, output and gh calls. */
async function sweep(
  merges: readonly Merge[],
  fakes: Readonly<Record<string, string>> = {},
): Promise<{ code: number; output: string; calls: string[] }> {
  const folder = root.path.replaceAll('\\', '/');
  const files = { GH_LOG: `${folder}/gh.log`, FAKE_WORLD: `${folder}/world` };
  const lines = merges.map((m) =>
    [m.sha, ago(m.minutes), m.parent, String(m.recorded), m.zap, String(m.page)].join(' '),
  );
  await writeFile(files.FAKE_WORLD, `${lines.join('\n')}\n`);
  await writeFile(files.GH_LOG, '');
  const env = { ...files, ...fakes, FAKE_HEAD: merges[0]?.sha ?? '', GH_REPO: repoName };
  const vars = { OWNER: 'blacklight0101', RUN_URL: runUrl, GH_TOKEN: 'token' };
  const script = stepScript(await checks(), 'sweep', name);
  const result = await runStep(script, { ...env, ...vars }, prelude);
  const calls = (await readFile(files.GH_LOG, 'utf8')).split('\n').filter((line) => line !== '');
  return { ...result, calls };
}

const posts = (calls: string[]): string[] => calls.filter((call) => call.includes('--method POST'));
const comments = (calls: string[]): string[] =>
  calls.filter((call) => call.startsWith('issue comment'));
/** A merge `minutes` old with the zap-baseline status `zap`; no release/ready and no parent unless given. */
const merge = (
  sha: string,
  minutes: number,
  zap: string,
  more: { readonly recorded?: number; readonly parent?: string; readonly page?: 2 } = {},
): Merge => ({
  ...{ sha, minutes, zap, recorded: more.recorded ?? 0 },
  ...{ parent: more.parent ?? '-', page: more.page ?? 1 },
});

describe('release-checks.yml sweep: the job', () => {
  it('DEC-227 runs only on the hourly schedule, with read access to contents and checks and write access to statuses and issues', async () => {
    const job = at(await checks(), 'jobs', 'sweep');

    expect(keysOf(job)).toEqual([
      'name',
      'if',
      'runs-on',
      'timeout-minutes',
      'permissions',
      'steps',
    ]);
    expect(at(job, 'if')).toBe("github.event_name == 'schedule'");
    expect(at(job, 'timeout-minutes')).toBe(5);
    expect(at(job, 'permissions')).toEqual({
      contents: 'read',
      checks: 'read',
      statuses: 'write',
      issues: 'write',
    });
  });

  it('DEC-227 runs the sweep script with the workflow token only, after a checkout that keeps no credentials', async () => {
    const steps = at(await checks(), 'jobs', 'sweep', 'steps');
    const list: unknown[] = Array.isArray(steps) ? steps : [];
    const [checkout, run] = list;

    expect(list).toHaveLength(2);
    expect(String(at(checkout, 'uses'))).toMatch(/^actions\/checkout@[0-9a-f]{40}$/u);
    expect(at(checkout, 'with')).toEqual({ 'persist-credentials': false });
    expect(at(run, 'name')).toBe(name);
    expect(at(run, 'run')).toBe('bash scripts/release-checks-sweep.sh');
    expect(at(run, 'env')).toEqual({
      GH_TOKEN: '${{ github.token }}',
      GH_REPO: '${{ github.repository }}',
      OWNER: '${{ github.repository_owner }}',
      RUN_URL:
        '${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}',
    });
  });
});

describe('release-checks.yml sweep: what it records', () => {
  it.each(['in_progress', 'queued', 'missing'])(
    'RF-1304 a merge with no release/ready whose zap-baseline is %s 40 minutes after it gets failure, named, and a comment',
    async (zap) => {
      const result = await sweep([merge(a, 50, zap)]);
      const [post = ''] = posts(result.calls);
      const [comment = ''] = comments(result.calls);
      const description = /description=(.*) -f target_url=/u.exec(post)?.[1] ?? '';

      expect(result.code).toBe(0);
      expect(posts(result.calls)).toHaveLength(1);
      expect(post).toContain(`api --method POST repos/${repoName}/statuses/${a}`);
      expect(post).toContain('-f state=failure -f context=release/ready');
      expect(post).toContain(`-f target_url=${runUrl}`);
      expect(description).toBe(
        'Not ready: zap-baseline did not finish on this commit within 40 minutes.',
      );
      expect(comment).toMatch(/^issue comment 12 --body @blacklight0101 /u);
      expect(comment).toContain(a);
      expect(comment).toContain(description);
      expect(comment).toContain('06:00');
      expect(comment).toContain(runUrl);
    },
  );
});

describe('release-checks.yml sweep: the other causes and the walk', () => {
  it('RF-1304 a merge whose zap-baseline finished but has no release/ready 2 hours after it gets failure: the checks did not run', async () => {
    const result = await sweep([merge(a, 180, 'completed')]);
    const [post = ''] = posts(result.calls);

    expect(post).toContain(`statuses/${a}`);
    expect(post).toMatch(
      /description=Not ready: the release checks did not run on this commit after zap-baseline finished; re-run zap-baseline to start them\. -f/u,
    );
    expect(comments(result.calls)).toHaveLength(1);
  });

  it.each([
    ['younger than 40 minutes', merge(a, 20, 'missing')],
    [
      'whose zap-baseline finished less than 2 hours after it (the checks may still run)',
      merge(a, 50, 'completed'),
    ],
    ['that has release/ready', merge(a, 180, 'in_progress', { recorded: 1 })],
    [
      'whose release/ready is past the first page of its statuses',
      merge(a, 180, 'in_progress', { recorded: 1, page: 2 }),
    ],
  ])('RF-1304 a merge %s records nothing and comments nothing', async (_label, world) => {
    const result = await sweep([world]);

    expect(result.code).toBe(0);
    expect(posts(result.calls)).toEqual([]);
    expect(comments(result.calls)).toEqual([]);
  });

  it('DEC-227 walks the first parents of main back to 24 hours and records each merge that has none', async () => {
    const result = await sweep([
      merge(a, 50, 'completed', { recorded: 1, parent: b }),
      merge(b, 180, 'missing', { parent: c }),
      merge(c, 25 * 60, 'missing', { parent: d }),
    ]);
    const lookups = result.calls.filter((call) => call.includes('/statuses?'));

    expect(posts(result.calls).map((call) => call.includes(`statuses/${b}`))).toEqual([true]);
    expect(lookups.map((call) => call.includes(`commits/${c}`))).toEqual([false, false]);
    expect(result.calls.some((call) => call.includes(`commits/${d}`))).toBe(false);
  });
});

describe('release-checks.yml sweep: a comment that fails', () => {
  it('DEC-227 an owner comment that fails stops neither the walk nor the record, and the sweep fails at the end', async () => {
    const result = await sweep([merge(a, 50, 'missing', { parent: b }), merge(b, 180, 'missing')], {
      FAKE_COMMENT_FAILS: '1',
    });

    expect(posts(result.calls).map((call) => call.includes(`statuses/${a}`))).toEqual([
      true,
      false,
    ]);
    expect(posts(result.calls).map((call) => call.includes(`statuses/${b}`))).toEqual([
      false,
      true,
    ]);
    expect(comments(result.calls)).toHaveLength(2);
    expect(result.code).not.toBe(0);
  });
});
