import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeGh, type FakeGh } from '../../support/fake-gh.js';
import { workflowText } from '../../support/workflow-files.js';
import { at, keysOf, runStep, stepScript, workflowDocument } from '../../support/workflow-yaml.js';

// DEC-175, ADR-025: .github/workflows/scheduled-release.yml. Production deploys at 06:00
// Europe/Madrid the morning after main changed, never on merge: two daily schedules (one of them is
// 06:00 in Madrid, by summer or winter time) start Release on main by workflow_dispatch, once per
// head commit of main. The step runs against a fake gh and date; nothing reaches GitHub.

const scheduled = (): Promise<unknown> => workflowDocument('scheduled-release.yml');
const sha = '0123456789abcdef0123456789abcdef01234567';

describe('scheduled-release.yml trigger and permissions', () => {
  it('DEC-175 runs at 04:07 and 05:07 UTC (off the busy full hour) and by hand', async () => {
    const document = await scheduled();

    expect(keysOf(at(document, 'on')).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(at(document, 'on', 'schedule')).toEqual([{ cron: '7 4 * * *' }, { cron: '7 5 * * *' }]);
  });

  it('RNF-003 has one job with contents: read and actions: write only, and reads no secret', async () => {
    const document = await scheduled();
    const [job = ''] = keysOf(at(document, 'jobs'));

    expect(keysOf(at(document, 'jobs'))).toHaveLength(1);
    expect(at(document, 'permissions')).toEqual({ contents: 'read' });
    expect(at(document, 'jobs', job, 'permissions')).toEqual({
      contents: 'read',
      actions: 'write',
    });
    expect(at(document, 'jobs', job, 'environment')).toBeUndefined();
    expect(await workflowText('scheduled-release.yml')).not.toContain('secrets.');
  });
});

let gh: FakeGh | undefined;
afterEach(async () => {
  await gh?.dispose();
  gh = undefined;
});

interface Run {
  readonly event?: string;
  readonly hour?: string;
  readonly enabled?: string;
  readonly activeRuns?: string;
}

/** Runs the one step of the job against a fake gh; returns its code, the gh calls and the summary. */
async function run(options: Run = {}): Promise<{ code: number; calls: string[]; summary: string }> {
  gh = await fakeGh({
    mainSha: sha,
    hour: options.hour ?? '06',
    activeRuns: options.activeRuns ?? '0',
  });
  const document = await scheduled();
  const [job = ''] = keysOf(at(document, 'jobs'));
  const summaryFile = `${gh.folder}/summary.md`;
  const env = {
    ...gh.env,
    EVENT: options.event ?? 'schedule',
    DEPLOY_ENABLED: options.enabled ?? 'true',
    GH_REPO: 'blacklight0101/Rosetta',
    GITHUB_STEP_SUMMARY: summaryFile,
  };
  const { code } = await runStep(stepScript(document, job, 'Release'), env, gh.prelude);
  const summary = await readFile(summaryFile, 'utf8').catch(() => '');
  return { code, calls: await gh.calls(), summary };
}

const dispatched = (calls: string[]): boolean =>
  calls.includes('workflow run release.yml --ref main');

describe('scheduled-release.yml Madrid hour', () => {
  it('DEC-175 a scheduled run at 06 in Madrid starts Release on main, asking date for Europe/Madrid', async () => {
    const result = await run({ hour: '06' });

    expect(result.code).toBe(0);
    expect(dispatched(result.calls)).toBe(true);
    expect(await gh?.zones()).toEqual(['Europe/Madrid']);
    expect(result.summary).toContain(sha);
  });

  it.each(['05', '07'])('DEC-175 a scheduled run at %s in Madrid starts nothing', async (hour) => {
    const result = await run({ hour });

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.summary).not.toBe('');
  });

  it('DEC-175 a run by hand starts Release at any hour', async () => {
    expect(dispatched((await run({ event: 'workflow_dispatch', hour: '15' })).calls)).toBe(true);
  });

  it('DEC-104 starts nothing while ROSETTA_DEPLOY_ENABLED is not true', async () => {
    const result = await run({ enabled: '' });

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.summary).toContain('ROSETTA_DEPLOY_ENABLED');
  });
});

describe('scheduled-release.yml once per head commit of main', () => {
  it('DEC-175 reads the head SHA of main and counts the queued, running or successful Release runs on it', async () => {
    const { calls } = await run();
    const list = calls.find((call) => call.startsWith('run list')) ?? '';

    expect(calls[0]).toBe('api repos/blacklight0101/Rosetta/commits/main --jq .sha');
    expect(list).toContain('--workflow release.yml --branch main');
    expect(list).toContain('headSha,status,conclusion');
    expect(list).toContain(`.headSha == "${sha}"`);
    expect(list).toContain('.status != "completed"');
    expect(list).toContain('.conclusion == "success"');
  });

  it('DEC-175 starts nothing when a Release run of that commit is queued, running or succeeded', async () => {
    const result = await run({ activeRuns: '1' });

    expect(result.code).toBe(0);
    expect(dispatched(result.calls)).toBe(false);
    expect(result.summary).toContain(sha);
  });

  it('DEC-175 starts Release again when every run of that commit failed or was cancelled', async () => {
    expect(dispatched((await run({ activeRuns: '0' })).calls)).toBe(true);
  });
});
