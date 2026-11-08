import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeGh, type FakeGh } from '../../support/fake-gh.js';
import { useTempRoot } from '../../support/temp-root.js';
import { at, keysOf, runStep, stepScript, workflowDocument } from '../../support/workflow-yaml.js';

// RF-1304, DEC-207, P8-64: after release-checks.yml has pushed the image of the release merge, it
// confirms the ZAP baseline and the staging check with the steps of the deploy job of release.yml,
// word for word (it first waits for zap-baseline of CI to finish), and in every case sets the
// commit status release/ready: success only when every step before it succeeded and both checks
// passed. Steps run with bash against a fake gh; nothing reaches GitHub.

const checks = (): Promise<unknown> => workflowDocument('release-checks.yml');
const release = (): Promise<unknown> => workflowDocument('release.yml');
const root = useTempRoot('rosetta-release-ready-');
const sha = '0123456789abcdef0123456789abcdef01234567';
const repoName = 'blacklight0101/Rosetta';
const wait = 'Wait for the ZAP baseline of this commit';
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
  it('RF-1304 confirms the ZAP baseline with the step of the deploy job of release.yml, word for word', async () => {
    const [own] = await named(checks(), 'checks', zap);
    const [deploy] = await named(release(), 'deploy', zap);

    expect(at(own, 'run')).toBe(at(deploy, 'run'));
    expect(at(own, 'env')).toEqual(at(deploy, 'env'));
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

  it('RF-1304 pushes the image first, then waits, confirms ZAP, then staging, and records release/ready before the failure comment', async () => {
    const document = checks();
    const all = await steps(document, 'checks');
    const push = all.findIndex((step) => String(at(step, 'run')).includes('docker push'));
    const order = await Promise.all(
      [wait, zap, staging, ready].map(async (name) => (await named(document, 'checks', name))[1]),
    );

    expect(push).toBeGreaterThan(-1);
    expect([push, ...order]).toEqual([...[push, ...order]].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(4);
    expect(order[0]).toBeGreaterThan(push);
    expect(order[3]).toBe(all.length - 2);
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
      { ...gh.env, GH_REPO: repoName, GITHUB_SHA: sha },
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

/** A fake gh that answers the lines of `answers` in turn (the last one repeats; `error` fails). */
const waitPrelude = [
  'gh() {',
  `  printf '%s\\n' "$*" >> "$GH_LOG"`,
  `  n=$(( $(wc -l < "$GH_LOG") ))`,
  `  line="$(sed -n "\${n}p" "$GH_ANSWERS")"`,
  `  [ -n "$line" ] || line="$(tail -n 1 "$GH_ANSWERS")"`,
  `  [ "$line" != error ] || return 1`,
  `  printf '%s\\n' "$line"`,
  '}',
  `sleep() { printf '%s\\n' "$1" >> "$SLEEP_LOG"; }`,
].join('\n');

/** Runs the wait step against the answers; returns its code, output, gh calls and sleeps. */
async function waitFor(answers: string[]): Promise<{
  code: number;
  output: string;
  calls: string[];
  slept: number;
}> {
  const folder = root.path.replaceAll('\\', '/');
  const files = {
    GH_LOG: `${folder}/gh.log`,
    GH_ANSWERS: `${folder}/answers`,
    SLEEP_LOG: `${folder}/sleep.log`,
  };
  await writeFile(files.GH_ANSWERS, `${answers.join('\n')}\n`);
  const script = stepScript(await checks(), 'checks', wait);
  const result = await runStep(
    script,
    { ...files, GH_REPO: repoName, GITHUB_SHA: sha },
    waitPrelude,
  );
  const lines = async (path: string): Promise<string[]> =>
    (await readFile(path, 'utf8').catch(() => '')).split('\n').filter((line) => line !== '');
  const slept = (await lines(files.SLEEP_LOG)).reduce((sum, each) => sum + Number(each), 0);
  return { ...result, calls: await lines(files.GH_LOG), slept };
}

describe('release-checks.yml waits for zap-baseline of CI', () => {
  it('RF-1304 polls the status of zap-baseline on the commit until it is completed, through a gh error', async () => {
    const result = await waitFor(['missing', 'queued', 'error', 'in_progress', 'completed', 'x']);

    expect(result.code).toBe(0);
    expect(result.calls).toHaveLength(5);
    expect(new Set(result.calls)).toEqual(
      new Set([
        `api repos/${repoName}/commits/${sha}/check-runs?check_name=zap-baseline --jq .check_runs[0].status // "missing"`,
      ]),
    );
  });

  it('RF-1304 stops waiting after 40 minutes and leaves the decision to the ZAP step', async () => {
    const result = await waitFor(['in_progress']);
    const [waitStep] = await named(checks(), 'checks', wait);

    expect(result.code).toBe(0);
    expect(result.calls).toHaveLength(80);
    expect(result.slept).toBe(40 * 60);
    expect(result.output).toContain('::warning::');
    expect(at(waitStep, 'id')).toBe('zap-wait');
    expect(keysOf(waitStep)).toEqual(['name', 'id', 'run', 'env']);
    expect(at(await checks(), 'jobs', 'checks', 'timeout-minutes')).toBe(60);
  });
});
