import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { at, keysOf, runStep, stepScript, workflowDocument } from '../../support/workflow-yaml.js';

// RF-1304, DEC-207, P8-64: the last step of release-checks.yml sets the commit status release/ready
// on the release merge in every case (if: always()): success only when the job so far succeeded and
// the ZAP wait, the ZAP check and the staging check each succeeded; otherwise failure with a
// description that names what failed or did not run. The step runs with bash against a fake gh
// that records each argument; nothing reaches GitHub.

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
  it('RF-1304 is the last step and runs always, so a failed or cancelled check still records the result', async () => {
    const steps = at(await checks(), 'jobs', 'checks', 'steps');
    const last: unknown = Array.isArray(steps) ? steps.at(-1) : undefined;

    expect(at(last, 'name')).toBe(name);
    expect(at(last, 'if')).toBe('always()');
    expect(keysOf(last)).toEqual(['name', 'if', 'run', 'env']);
  });

  it('RF-1304 reads the job status and the outcome of each check, and only the workflow token', async () => {
    expect(at(await statusStep(), 'env')).toEqual({
      JOB_STATUS: '${{ job.status }}',
      ZAP_WAIT: '${{ steps.zap-wait.outcome }}',
      ZAP: '${{ steps.zap.outcome }}',
      STAGING: '${{ steps.staging.outcome }}',
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

/** A fake gh that writes each argument on its own line and `--end--` after each call. */
const prelude = [
  'gh() {',
  `  for arg in "$@"; do printf '%s\\n' "$arg"; done >> "$GH_LOG"`,
  `  printf '%s\\n' '--end--' >> "$GH_LOG"`,
  '}',
].join('\n');

interface Posted {
  readonly code: number;
  readonly calls: string[][];
  readonly fields: Readonly<Record<string, string>>;
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
async function post(outcomes: readonly [string, string, string, string]): Promise<Posted> {
  const [JOB_STATUS, ZAP_WAIT, ZAP, STAGING] = outcomes;
  const log = `${root.path.replaceAll('\\', '/')}/gh.log`;
  const env = { JOB_STATUS, ZAP_WAIT, ZAP, STAGING, GH_LOG: log, GH_REPO: repoName };
  const script = stepScript(await checks(), 'checks', name);
  const result = await runStep(script, { ...env, GITHUB_SHA: sha, RUN_URL: runUrl }, prelude);
  const text = await readFile(log, 'utf8').catch(() => '');
  const calls = text
    .split('--end--\n')
    .filter((call) => call !== '')
    .map((call) => call.split('\n').filter((line) => line !== ''));
  return { code: result.code, calls, fields: fieldsOf(calls[0] ?? []) };
}

describe('release-checks.yml release/ready: what it records', () => {
  it.each([
    [['success', 'success', 'success', 'success'], 'success', /^Ready: /u],
    [['failure', 'success', 'failure', 'skipped'], 'failure', /ZAP baseline did not pass/u],
    [['failure', 'failure', 'skipped', 'skipped'], 'failure', /ZAP baseline did not pass/u],
    [['failure', 'success', 'success', 'failure'], 'failure', /staging check did not pass/u],
    [['failure', 'skipped', 'skipped', 'skipped'], 'failure', /image build, scan or push failed/u],
    [['cancelled', 'cancelled', 'skipped', 'skipped'], 'failure', /cancelled/u],
    [['success', 'success', 'success', 'skipped'], 'failure', /did not run/u],
    [['success', 'success', 'success', ''], 'failure', /did not run/u],
    [['success', 'success', 'skipped', 'success'], 'failure', /did not run/u],
    [['success', 'skipped', 'success', 'success'], 'failure', /did not run/u],
  ] as const)(
    'RF-1304 job, wait, ZAP, staging %j record release/ready %s',
    async (outcomes, state, description) => {
      const result = await post(outcomes);
      const { description: text = '', ...rest } = result.fields;

      expect(result.calls).toHaveLength(1);
      expect(result.calls[0]?.slice(0, 4)).toEqual([
        'api',
        '--method',
        'POST',
        `repos/${repoName}/statuses/${sha}`,
      ]);
      expect(rest).toEqual({ state, context: 'release/ready', target_url: runUrl });
      expect(text).toMatch(description);
      expect(text.length).toBeLessThanOrEqual(140);
      expect(result.code === 0).toBe(state === 'success');
    },
  );
});
