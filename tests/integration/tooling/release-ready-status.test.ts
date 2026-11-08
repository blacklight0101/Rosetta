import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { at, keysOf, runStep, stepScript, workflowDocument } from '../../support/workflow-yaml.js';

// RF-1304, DEC-207, P8-64, P8-141: the last step of release-checks.yml sets the commit status
// release/ready on the release merge (COMMIT) in every case (if: always()): success only when the job
// so far succeeded and the ZAP check and the staging check each succeeded; otherwise failure with a
// description that names what failed or did not run, which it also writes as the output `cause`
// for the failure comment (P8-65). The step runs with bash against a fake gh that records each
// argument; nothing reaches GitHub.

const checks = (): Promise<unknown> => workflowDocument('release-checks.yml');
const root = useTempRoot('rosetta-release-ready-status-');
const sha = '0123456789abcdef0123456789abcdef01234567';
const repoName = 'blacklight0101/Rosetta';
const runUrl = 'https://github.com/blacklight0101/Rosetta/actions/runs/42';
const name = 'Record release/ready on the commit';

/** The release/ready step, as parsed. */
async function statusStep(): Promise<unknown> {
  const steps = at(await checks(), 'jobs', 'checks', 'steps');
  return (Array.isArray(steps) ? steps : []).find((step: unknown) => at(step, 'name') === name);
}

describe('release-checks.yml release/ready: the step', () => {
  it('RF-1304 comes after every check, before only the failure comment, and runs always, so a failed or cancelled check still records the result', async () => {
    const steps = at(await checks(), 'jobs', 'checks', 'steps');
    const own: unknown = Array.isArray(steps) ? steps.at(-2) : undefined;

    expect(at(own, 'name')).toBe(name);
    expect(at(own, 'id')).toBe('ready');
    expect(at(own, 'if')).toBe('always()');
    expect(keysOf(own)).toEqual(['name', 'id', 'if', 'run', 'env']);
  });

  it('RF-1304 reads the job status, the outcome of each check, whether staging is enabled, and only the workflow token', async () => {
    expect(at(await statusStep(), 'env')).toEqual({
      JOB_STATUS: '${{ job.status }}',
      ZAP: '${{ steps.zap.outcome }}',
      STAGING: '${{ steps.staging.outcome }}',
      STAGING_ENABLED: '${{ vars.ROSETTA_STAGING_ENABLED }}',
      GH_TOKEN: '${{ github.token }}',
      GH_REPO: '${{ github.repository }}',
      RUN_URL:
        '${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}',
    });
  });

  it('RF-1304 is the only step that sets a commit status', async () => {
    const steps = at(await checks(), 'jobs', 'checks', 'steps');
    const setting = (Array.isArray(steps) ? steps : []).filter((step: unknown) =>
      JSON.stringify(step).includes('statuses'),
    );

    expect(setting.map((step: unknown) => at(step, 'name'))).toEqual([name]);
  });
});

/**
 * A fake gh that writes each argument on its own line and `--end--` after each call, and answers a
 * check-runs lookup with the zap-baseline conclusion in FAKE_ZAP.
 */
const prelude = [
  'gh() {',
  `  for arg in "$@"; do printf '%s\\n' "$arg"; done >> "$GH_LOG"`,
  `  printf '%s\\n' '--end--' >> "$GH_LOG"`,
  `  case "$*" in *check-runs*) printf '%s\\n' "$FAKE_ZAP" ;; esac`,
  '}',
].join('\n');

interface Posted {
  readonly code: number;
  /** The status POSTs. */
  readonly posts: string[][];
  /** Every other gh call. */
  readonly lookups: string[][];
  readonly fields: Readonly<Record<string, string>>;
  /** What the step wrote to GITHUB_OUTPUT. */
  readonly output: string;
}

/** What the fake world answers besides the step outcomes. */
interface World {
  /** The conclusion of zap-baseline on the commit (`missing` when it has none). */
  readonly zap?: string;
  /** The repository variable ROSETTA_STAGING_ENABLED. */
  readonly stagingEnabled?: string;
}

/** The `-f key=value` fields of one gh call. */
function fieldsOf(call: readonly string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  call.forEach((arg, i) => {
    const value = call[i + 1] ?? '';
    if (arg !== '-f' || !value.includes('=')) return;
    fields[value.slice(0, value.indexOf('='))] = value.slice(value.indexOf('=') + 1);
  });
  return fields;
}

/** Runs the release/ready step with the given job status and step outcomes. */
async function post(
  outcomes: readonly [string, string, string],
  world: World = {},
): Promise<Posted> {
  const [JOB_STATUS, ZAP, STAGING] = outcomes;
  const folder = root.path.replaceAll('\\', '/');
  const files = { GH_LOG: `${folder}/gh.log`, GITHUB_OUTPUT: `${folder}/output` };
  const answers = {
    FAKE_ZAP: world.zap ?? 'failure',
    STAGING_ENABLED: world.stagingEnabled ?? 'true',
  };
  const env = { JOB_STATUS, ZAP, STAGING, GH_REPO: repoName, ...files, ...answers };
  const script = stepScript(await checks(), 'checks', name);
  const vars = { COMMIT: sha, GITHUB_SHA: 'f'.repeat(40), RUN_URL: runUrl };
  const result = await runStep(script, { ...env, ...vars }, prelude);
  const text = await readFile(files.GH_LOG, 'utf8').catch(() => '');
  const output = await readFile(files.GITHUB_OUTPUT, 'utf8').catch(() => '');
  const calls = text
    .split('--end--\n')
    .filter((call) => call !== '')
    .map((call) => call.split('\n').filter((line) => line !== ''));
  const posts = calls.filter((call) => call.includes('POST'));
  const lookups = calls.filter((call) => !call.includes('POST'));
  return { code: result.code, posts, lookups, fields: fieldsOf(posts[0] ?? []), output };
}

const zapLookup = [
  'api',
  `repos/${repoName}/commits/${sha}/check-runs?check_name=zap-baseline`,
  '--jq',
  '.check_runs[0].conclusion // "missing"',
];

describe('release-checks.yml release/ready: what it records', () => {
  it.each([
    [['success', 'success', 'success'], 'success', /^Ready: .*staging check passed/u],
    [['failure', 'failure', 'skipped'], 'failure', /ZAP baseline did not pass/u],
    [['failure', 'success', 'failure'], 'failure', /staging check did not pass/u],
    [['failure', 'skipped', 'skipped'], 'failure', /image build, scan or push failed/u],
    [['cancelled', 'skipped', 'skipped'], 'failure', /cancelled/u],
    [['success', 'success', 'skipped'], 'failure', /did not run/u],
    [['success', 'success', ''], 'failure', /did not run/u],
    [['success', 'skipped', 'success'], 'failure', /did not run/u],
  ] as const)(
    'RF-1304 job, ZAP, staging %j record release/ready %s',
    async (outcomes, state, description) => {
      const result = await post(outcomes);
      const { description: text = '', ...rest } = result.fields;

      expect(result.posts).toHaveLength(1);
      expect(result.posts[0]?.slice(0, 4)).toEqual([
        'api',
        '--method',
        'POST',
        `repos/${repoName}/statuses/${sha}`,
      ]);
      expect(rest).toEqual({ state, context: 'release/ready', target_url: runUrl });
      expect(text).toMatch(description);
      expect(text.length).toBeLessThanOrEqual(140);
      expect(result.code === 0).toBe(state === 'success');
      expect(result.output).toBe(state === 'success' ? '' : `cause=${text}\n`);
    },
  );
});

describe('release-checks.yml release/ready: the named causes', () => {
  it('RF-1304 says the staging check was skipped, not passed, while staging is not enabled', async () => {
    const result = await post(['success', 'success', 'success'], { stagingEnabled: '' });
    const text = result.fields['description'] ?? '';

    expect(result.fields['state']).toBe('success');
    expect(text).toMatch(/^Ready: .*staging check was skipped/u);
    expect(text).not.toMatch(/staging check passed/u);
    expect(text.length).toBeLessThanOrEqual(140);
  });

  it.each([
    [
      'cancelled',
      /^Not ready: zap-baseline was cancelled on this commit \(a later push to main cancels it\); re-run it and these checks run again/u,
    ],
    // CI completed (that started the job) without a zap-baseline result.
    ['missing', /^Not ready: CI finished without a zap-baseline result on this commit/u],
    ['failure', /^Not ready: the ZAP baseline did not pass on this commit/u],
  ] as const)(
    'RF-1304 a ZAP baseline that ends %s is named plainly in release/ready and the cause',
    async (zap, description) => {
      const result = await post(['failure', 'failure', 'skipped'], { zap });
      const text = result.fields['description'] ?? '';

      expect(result.lookups).toEqual([zapLookup]);
      expect(result.fields['state']).toBe('failure');
      expect(text).toMatch(description);
      expect(text.length).toBeLessThanOrEqual(140);
      expect(result.output).toBe(`cause=${text}\n`);
    },
  );

  it('RF-1304 looks the ZAP baseline up only when it failed', async () => {
    const passed = await post(['success', 'success', 'success']);
    const staging = await post(['failure', 'success', 'failure']);

    expect(passed.lookups).toEqual([]);
    expect(staging.lookups).toEqual([]);
  });
});
