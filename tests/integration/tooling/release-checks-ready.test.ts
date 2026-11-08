import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeGh, type FakeGh } from '../../support/fake-gh.js';
import { useTempRoot } from '../../support/temp-root.js';
import { at, keysOf, runStep, stepScript, workflowDocument } from '../../support/workflow-yaml.js';

// RF-1304, DEC-207, DEC-227, P8-64, P8-141: after release-checks.yml has pushed the image of the
// release merge, it confirms the ZAP baseline and the staging check with the steps of the deploy job
// of release.yml, word for word (CI, zap-baseline included, has completed: its completion started
// the job), and in every case sets the commit status release/ready: success only when every step
// before it succeeded and both checks passed. Steps run with bash against a fake gh; nothing
// reaches GitHub.

const checks = (): Promise<unknown> => workflowDocument('release-checks.yml');
const release = (): Promise<unknown> => workflowDocument('release.yml');
const root = useTempRoot('rosetta-release-ready-');
const sha = '0123456789abcdef0123456789abcdef01234567';
const repoName = 'blacklight0101/Rosetta';
const zap = 'The ZAP baseline passed on this commit';
const staging = 'This tree passed staging';
const ready = 'Record release/ready on the commit';

/** The steps of one job, as parsed. */
async function steps(document: Promise<unknown>, job: string): Promise<unknown[]> {
  const found = at(await document, 'jobs', job, 'steps');
  const list: unknown[] = Array.isArray(found) ? found : [];
  return list;
}

/** The step of `job` named exactly `name`, and its index; -1 when there is none. */
async function named(
  document: Promise<unknown>,
  job: string,
  name: string,
): Promise<[unknown, number]> {
  const all = await steps(document, job);
  const index = all.findIndex((step) => at(step, 'name') === name);
  return [all[index], index];
}

describe('release-checks.yml ZAP and staging confirmation: the steps of release.yml', () => {
  it('RF-1304 confirms the ZAP baseline with the step of the deploy job of release.yml, word for word, on its own commit', async () => {
    const [own] = await named(checks(), 'checks', zap);
    const [deploy] = await named(release(), 'deploy', zap);
    const env = at(deploy, 'env');
    const rest = keysOf(env).filter((key) => key !== 'COMMIT');

    expect(at(own, 'run')).toBe(at(deploy, 'run'));
    // Release names its own commit; the checks job sets COMMIT once, for every step.
    expect(at(env, 'COMMIT')).toBe('${{ github.sha }}');
    expect(at(own, 'env')).toEqual(Object.fromEntries(rest.map((key) => [key, at(env, key)])));
    expect(String(at(own, 'run'))).toContain('$COMMIT');
    expect(keysOf(own)).toEqual(['name', 'id', 'run', 'env']);
    expect(at(own, 'id')).toBe('zap');
  });

  it('RF-1304 confirms the staging check with the step of the deploy job of release.yml, without skip-staging-check', async () => {
    const [own] = await named(checks(), 'checks', staging);
    const [deploy] = await named(release(), 'deploy', staging);
    const env = at(deploy, 'env');
    const rest = keysOf(env).filter((key) => key !== 'SKIP_STAGING_CHECK');

    expect(at(own, 'run')).toBe(at(deploy, 'run'));
    expect(at(env, 'SKIP_STAGING_CHECK')).toBe('${{ inputs.skip-staging-check }}');
    expect(at(own, 'env')).toEqual(Object.fromEntries(rest.map((key) => [key, at(env, key)])));
    expect(keysOf(own)).toEqual(['name', 'id', 'run', 'env']);
    expect(at(own, 'id')).toBe('staging');
  });
});

describe('release-checks.yml ZAP and staging confirmation: the order of the steps', () => {
  it('RF-1304 pushes the image first, then confirms ZAP, then staging, and records release/ready before the failure comment', async () => {
    const document = checks();
    const all = await steps(document, 'checks');
    const push = all.findIndex((step) => String(at(step, 'run')).includes('docker push'));
    const order = await Promise.all(
      [zap, staging, ready].map(async (name) => (await named(document, 'checks', name))[1]),
    );

    expect(push).toBeGreaterThan(-1);
    expect([push, ...order]).toEqual([...[push, ...order]].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(3);
    expect(order[0]).toBeGreaterThan(push);
    expect(order[2]).toBe(all.length - 2);
  });

  it('RF-1304 no step continues on error, and only the GHCR logout, release/ready and the failure comment run after a failure', async () => {
    const all = await steps(checks(), 'checks');

    expect(all.filter((step) => at(step, 'continue-on-error') !== undefined)).toEqual([]);
    expect(all.flatMap((step) => (at(step, 'if') === undefined ? [] : [at(step, 'name')]))).toEqual(
      ['Log out of GHCR', ready, 'Tell the owner the checks failed'],
    );
  });
});

let gh: FakeGh | undefined;
afterEach(async () => {
  await gh?.dispose();
  gh = undefined;
});

describe('release-checks.yml ZAP confirmation: behaviour', () => {
  it.each([
    ['success', 0],
    ['failure', 1],
    ['cancelled', 1],
    ['skipped', 1],
    ['missing', 1],
    ['null', 1],
  ])('RF-1304 zap-baseline %s on the commit gives exit %i', async (conclusion, code) => {
    gh = await fakeGh({ conclusion });
    const script = stepScript(await checks(), 'checks', zap);
    const result = await runStep(
      script,
      { ...gh.env, GH_REPO: repoName, COMMIT: sha, GITHUB_SHA: 'f'.repeat(40) },
      gh.prelude,
    );

    expect(result.code === 0 ? 0 : 1).toBe(code);
    expect(await gh.calls()).toEqual([
      `api repos/${repoName}/commits/${sha}/check-runs?check_name=zap-baseline --jq .check_runs[0].conclusion // "missing"`,
    ]);
  });
});

const git = promisify(execFile);

/** Runs the staging step in a repository whose HEAD has one parent, with ROSETTA_STAGING_ENABLED. */
async function stagingOnSingleParent(enabled: string): Promise<{ code: number; output: string }> {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.test' };
  const identity = { ...env, GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.test' };
  const cwd = root.path;
  await git('git', ['init', '--quiet'], { cwd });
  await writeFile(join(cwd, 'x'), 'x');
  await git('git', ['add', 'x'], { cwd });
  await git('git', ['commit', '--quiet', '-m', 'x'], { cwd, env: identity });
  gh = await fakeGh();
  const script = stepScript(await checks(), 'checks', staging);
  const summary = `${gh.folder}/summary.md`;
  const vars = { STAGING_ENABLED: enabled, GH_REPO: repoName, GITHUB_STEP_SUMMARY: summary };
  const folder = cwd.replaceAll('\\', '/');
  return runStep(script, { ...gh.env, ...vars }, `${gh.prelude}\ncd "${folder}"`);
}

describe('release-checks.yml staging confirmation: behaviour', () => {
  it('RF-1304 once ROSETTA_STAGING_ENABLED is true a commit that is not a release merge fails, with no override', async () => {
    const result = await stagingOnSingleParent('true');

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('::error::');
  });

  it('RF-1304 while ROSETTA_STAGING_ENABLED is not true the check is skipped with a warning, as in Release', async () => {
    const result = await stagingOnSingleParent('');

    expect(result.code).toBe(0);
    expect(result.output).toContain('::warning::staging is not enabled');
  });
});

describe('release-checks.yml holds no runner to wait for zap-baseline (DEC-227)', () => {
  it('DEC-227 no step sleeps, loops or polls a check: CI has completed when the job starts', async () => {
    const all = await steps(checks(), 'checks');
    const scripts = all.map((step) => {
      const run = at(step, 'run');
      return typeof run === 'string' ? run : '';
    });

    expect(
      scripts.filter((script) => /\bsleep\b|\bseq\b|\bwhile\b|\buntil\b/u.test(script)),
    ).toEqual([]);
    expect(
      all.map((step) => String(at(step, 'name'))).filter((name) => /wait/iu.test(name)),
    ).toEqual([]);
    expect(all.map((step) => at(step, 'id'))).not.toContain('zap-wait');
  });
});
