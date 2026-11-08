import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { violations } from '../../support/workflow-files.js';
import { at, runStep, stepScript, workflowDocument } from '../../support/workflow-yaml.js';

// DEC-227 (P8-140): a job fetches only the git history it reads. A checkout whose fetch-depth is
// not a plain positive number (0, or an expression that can give 0) may fetch the whole history, so
// it says why on the same line. The depths of the jobs that read history are pinned here, and the
// history they read is shown to be in a clone of that depth.

const run = promisify(execFile);

/** The fetch-depth lines that may fetch the whole history without a reason on the same line. */
function unexplainedFullFetches(lines: readonly string[]): string[] {
  return lines.flatMap((line, i) => {
    const match = /^\s*fetch-depth:\s*(.*?)\s*(?:#\s*(.*))?$/u.exec(line);
    if (!match) return [];
    const reason = (match[2] ?? '').trim().split(/\s+/u).filter(Boolean);
    const bounded = /^[1-9]\d*$/u.test(match[1] ?? '');
    return bounded || reason.length >= 4 ? [] : [`line ${String(i + 1)}: ${line.trim()}`];
  });
}

/** The `with` of the first checkout step of a job. */
async function checkoutOf(file: string, job: string): Promise<unknown> {
  const steps = at(await workflowDocument(file), 'jobs', job, 'steps');
  const list: unknown[] = Array.isArray(steps) ? steps : [];
  const checkout = list.find((step) => String(at(step, 'uses')).startsWith('actions/checkout@'));
  return at(checkout, 'with');
}

describe('DEC-227 fetch-depth: the rule', () => {
  it('DEC-227 every checkout that may fetch the whole history says why on the same line', async () => {
    expect(await violations((workflow) => unexplainedFullFetches(workflow.lines))).toEqual([]);
  });

  it.each([
    ['fetch-depth: 0', 1],
    ["fetch-depth: '0'", 1],
    ['fetch-depth: ${{ steps.history.outputs.depth }}', 1],
    ['fetch-depth: 0 # full history', 1],
    ['fetch-depth: 0 # release-tags.sh reads main down to the tag', 0],
    ['fetch-depth: 2', 0],
    ['fetch-depth: 1 # one commit', 0],
  ] as const)('DEC-227 the rule finds %j %i time(s)', (line, count) => {
    expect(unexplainedFullFetches(['steps:', `          ${line}`])).toHaveLength(count);
  });
});

describe('DEC-227 fetch-depth: what each job fetches', () => {
  it.each([
    ['ci.yml', 'changes', 2],
    ['release.yml', 'deploy', 2],
    ['release-checks.yml', 'checks', 2],
  ] as const)(
    'DEC-227 %s %s fetches the commit and its parents (depth %i)',
    async (file, job, depth) => {
      expect(at(await checkoutOf(file, job), 'fetch-depth')).toBe(depth);
    },
  );

  it('DEC-227 DEC-29 the release image fetches one commit, and the whole history only for a tag', async () => {
    expect(at(await checkoutOf('release.yml', 'image'), 'fetch-depth')).toBe(
      "${{ github.ref_type != 'tag' && 1 || 0 }}",
    );
  });

  it('DEC-227 gitleaks fetches the depth that its history step works out', async () => {
    expect(at(await checkoutOf('ci.yml', 'gitleaks'), 'fetch-depth')).toBe(
      '${{ steps.history.outputs.depth }}',
    );
  });

  it.each([
    [{ EVENT: 'pull_request', PR_COMMITS: '4', SECOND_PUSHED: '' }, 'depth=6'],
    [{ EVENT: 'pull_request', PR_COMMITS: '1', SECOND_PUSHED: '' }, 'depth=3'],
    [{ EVENT: 'push', PR_COMMITS: '', SECOND_PUSHED: '' }, 'depth=2'],
    [{ EVENT: 'push', PR_COMMITS: '', SECOND_PUSHED: 'abc123' }, 'depth=0'],
  ] as const)('DEC-227 the gitleaks history step for %j prints %s', async (env, expected) => {
    const script = stepScript(await workflowDocument('ci.yml'), 'gitleaks', 'History');
    const result = await runStep(script, { ...env, GITHUB_OUTPUT: '/dev/null' });

    expect(script).not.toBe('');
    expect(result.code).toBe(0);
    expect(result.output.trim()).toBe(expected);
  });
});

const identity = ['-c', 'user.name=ci', '-c', 'user.email=ci@example.invalid'];

const git = async (cwd: string, ...args: string[]): Promise<string> =>
  (await run('git', [...identity, ...args], { cwd })).stdout.trim();

/** Commits one new file `name` and returns the commit. */
async function commit(cwd: string, name: string): Promise<string> {
  await writeFile(
    join(cwd, name),
    `${name}
`,
  );
  await git(cwd, 'add', name);
  await git(cwd, 'commit', '-qm', name);
  return git(cwd, 'rev-parse', 'HEAD');
}

/** An empty repository `origin` under `root` on the branch main. */
async function origin(root: string): Promise<string> {
  const path = join(root, 'origin');
  await mkdir(path);
  await git(path, 'init', '-q', '-b', 'main');
  return path;
}

/** A clone of `branch` of `origin` with `depth` commits, the way actions/checkout fetches. */
async function shallowClone(root: string, branch: string, depth: number): Promise<string> {
  const clone = join(root, `clone-${branch}`);
  const url = pathToFileURL(join(root, 'origin')).href;
  await run('git', ['clone', '-q', '--depth', String(depth), '--branch', branch, url, clone]);
  return clone;
}

describe('DEC-227 fetch-depth: the history is in a clone of that depth', () => {
  const repo = useTempRoot('rosetta-depth-');

  it('DEC-227 gitleaks: the range of a pull request of n commits is whole at depth n + 2', async () => {
    const path = await origin(repo.path);
    await commit(path, 'b1');
    await commit(path, 'b2');
    await git(path, 'checkout', '-q', '-b', 'pr');
    const first = await commit(path, 'p1');
    await commit(path, 'p2');
    await git(path, 'checkout', '-q', 'main');
    await commit(path, 'b3');
    await commit(path, 'b4');
    await git(path, 'checkout', '-q', 'pr');
    await git(path, 'merge', '-q', '--no-ff', '-m', 'p3 merge main', 'main');
    const head = await commit(path, 'p4');
    await git(path, 'checkout', '-q', 'main');
    await git(path, 'merge', '-q', '--no-ff', '-m', 'merge ref', 'pr');
    // The four commits of the pull request: p1, p2, the merge of main and p4.
    const range = ['log', '--no-merges', '--first-parent', '--format=%H', `${first}^..${head}`];
    const clone = await shallowClone(repo.path, 'main', 4 + 2);

    expect(await git(clone, ...range)).toBe(await git(path, ...range));
    expect((await git(clone, ...range)).split('\n')).toHaveLength(3);
  });

  it('DEC-227 the staging check: a release merge and its develop parent with its tree are at depth 2', async () => {
    const path = await origin(repo.path);
    await commit(path, 'm1');
    await git(path, 'checkout', '-q', '-b', 'develop');
    await commit(path, 'd1');
    const develop = await commit(path, 'd2');
    await git(path, 'checkout', '-q', 'main');
    await git(path, 'merge', '-q', '--no-ff', '-m', 'release', 'develop');
    const clone = await shallowClone(repo.path, 'main', 2);
    const second = await git(clone, 'rev-parse', '--verify', '--quiet', 'HEAD^2^{commit}');

    expect(second).toBe(develop);
    expect(await git(clone, 'rev-parse', `${second}^{tree}`)).toBe(
      await git(clone, 'rev-parse', 'HEAD^{tree}'),
    );
  });
});

describe('DEC-227 fetch-depth: a push of one commit', () => {
  const repo = useTempRoot('rosetta-push-');

  it('DEC-227 gitleaks: a push of one commit at depth 2 shows only that commit, not the whole tree', async () => {
    const path = await origin(repo.path);
    await commit(path, 'old');
    await commit(path, 'new');
    await git(path, 'branch', 'push');
    // gitleaks-action scans `git log -p -1` on a push of one commit. At depth 1 that commit is a
    // shallow root, so its patch adds every file of the tree; at depth 2 it is only its own change.
    const patch = ['log', '-p', '-1', '--format=', '--name-only'];
    const shallow = await shallowClone(repo.path, 'main', 1);
    const clone = await shallowClone(repo.path, 'push', 2);

    expect((await git(shallow, ...patch)).split(String.fromCharCode(10))).toContain('old');
    expect((await git(clone, ...patch)).split(String.fromCharCode(10))).toEqual(['new']);
  });
});
