import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeGh, type FakeGh } from '../../support/fake-gh.js';
import {
  at,
  runStep,
  stepIndex,
  stepScript,
  workflowDocument,
} from '../../support/workflow-yaml.js';

// DEC-175, ADR-025: the step "This tree passed staging" of the deploy job of release.yml. A release
// is a merge commit of develop into main; production deploys it only when its tree equals the tree
// of its second parent (the develop commit) and the check `deploy (staging)` passed on that commit.
// The input skip-staging-check (emergencies only) skips the check and says so in the summary. The
// step runs in a throwaway git repository against a fake gh; nothing reaches GitHub.

const release = (): Promise<unknown> => workflowDocument('release.yml');
const git = promisify(execFile);

describe('release.yml staging check: placement', () => {
  it('DEC-175 has a boolean input skip-staging-check that defaults to false and says emergencies only', async () => {
    const input = at(await release(), 'on', 'workflow_dispatch', 'inputs', 'skip-staging-check');

    expect(at(input, 'type')).toBe('boolean');
    expect(at(input, 'default')).toBe(false);
    expect(String(at(input, 'description'))).toMatch(/emergenc/iu);
  });

  it('DEC-175 checks staging after the ZAP baseline and before the Azure login, with full history', async () => {
    const document = await release();
    const check = stepIndex(document, 'deploy', 'This tree passed staging');
    const steps = at(document, 'jobs', 'deploy', 'steps');
    const checkout: unknown = Array.isArray(steps) ? steps[0] : undefined;

    expect(check).toBeGreaterThan(stepIndex(document, 'deploy', 'zap-baseline'));
    expect(check).toBeLessThan(stepIndex(document, 'deploy', 'azure/login@'));
    expect(String(at(checkout, 'uses'))).toMatch(/^actions\/checkout@/u);
    expect(at(checkout, 'with', 'fetch-depth')).toBe(0);
  });
});

let gh: FakeGh | undefined;
let repo: string | undefined;
afterEach(async () => {
  await gh?.dispose();
  if (repo !== undefined) await rm(repo, { recursive: true, force: true });
  gh = undefined;
  repo = undefined;
});

const identity = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.test',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.test',
};

/** Runs git in the repository and returns its trimmed output. */
async function inRepo(...args: string[]): Promise<string> {
  const env = { ...process.env, ...identity };
  return (await git('git', args, { cwd: repo, env })).stdout.trim();
}

/** A commit with one file `x` holding `content`, on the given parents; returns its SHA. */
async function commit(content: string, ...parents: string[]): Promise<string> {
  await writeFile(join(repo ?? '', 'x'), content);
  await inRepo('add', 'x');
  const tree = await inRepo('write-tree');
  return inRepo('commit-tree', tree, ...parents.flatMap((p) => ['-p', p]), '-m', content);
}

type Head = 'release merge' | 'merge with another tree' | 'single parent';

/** Builds main, develop and the HEAD of the given shape; returns the develop SHA. */
async function repository(head: Head): Promise<string> {
  repo = (await mkdtemp(join(tmpdir(), 'rosetta-staging-check-'))).replaceAll('\\', '/');
  await inRepo('init', '--quiet');
  const main = await commit('main');
  const develop = await commit('develop', main);
  const heads: Record<Head, () => Promise<string>> = {
    'release merge': async () => commit('develop', main, develop),
    'merge with another tree': async () => commit('hotfix', main, develop),
    'single parent': async () => commit('develop', main),
  };
  await inRepo('checkout', '--quiet', '--detach', await heads[head]());
  return develop;
}

interface Check {
  readonly head?: Head;
  readonly conclusion?: string;
  readonly skip?: string;
}

/** Runs the staging check; returns its code, output, gh calls, summary and the develop SHA. */
async function check(options: Check = {}): Promise<{
  code: number;
  output: string;
  calls: string[];
  summary: string;
  develop: string;
}> {
  const develop = await repository(options.head ?? 'release merge');
  gh = await fakeGh({ conclusion: options.conclusion ?? 'success' });
  const summaryFile = `${gh.folder}/summary.md`;
  const env = {
    ...gh.env,
    SKIP_STAGING_CHECK: options.skip ?? '',
    GH_REPO: 'blacklight0101/Rosetta',
    GITHUB_STEP_SUMMARY: summaryFile,
  };
  const script = stepScript(await release(), 'deploy', 'This tree passed staging');
  const result = await runStep(script, env, `${gh.prelude}\ncd "${repo ?? ''}"`);
  const summary = await readFile(summaryFile, 'utf8').catch(() => '');
  return { ...result, calls: await gh.calls(), summary, develop };
}

describe('release.yml staging check: the release merge commit', () => {
  it('DEC-175 passes a merge whose tree equals the develop side, when deploy (staging) passed on it', async () => {
    const result = await check();

    expect(result.code).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toContain(
      `repos/blacklight0101/Rosetta/commits/${result.develop}/check-runs?check_name=deploy%20(staging)`,
    );
  });

  it.each(['failure', 'skipped', 'missing', 'null'])(
    'DEC-175 refuses when deploy (staging) on the develop side is %s',
    async (conclusion) => {
      const result = await check({ conclusion });

      expect(result.code).not.toBe(0);
      expect(result.output).toContain('::error::');
    },
  );

  it('DEC-175 refuses a merge whose tree differs from the develop side, before asking GitHub', async () => {
    const result = await check({ head: 'merge with another tree' });

    expect(result.code).not.toBe(0);
    expect(result.calls).toEqual([]);
  });

  it('DEC-175 refuses a commit with no second parent (not a release merge)', async () => {
    const result = await check({ head: 'single parent' });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('::error::');
    expect(result.calls).toEqual([]);
  });

  it('DEC-175 skip-staging-check skips the check with a warning in the step summary', async () => {
    const result = await check({ head: 'single parent', skip: 'true' });

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.output).toContain('::warning::');
    expect(result.summary).toMatch(/skip-staging-check/u);
  });
});
