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
  it('DEC-175 runs at 04:07, 05:07, 05:37 and 06:07 UTC (off the busy full hour) and by hand', async () => {
    const document = await scheduled();

    expect(keysOf(at(document, 'on')).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(at(document, 'on', 'schedule')).toEqual([
      { cron: '7 4 * * *' },
      { cron: '7 5 * * *' },
      { cron: '37 5 * * *' },
      { cron: '7 6 * * *' },
    ]);
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

  // P7-28 review: two delayed slots fired together could both list no Release yet and both dispatch.
  // One concurrency group runs the slots one at a time, and a queued slot is never cancelled half-way.
  it('P7-28 runs the slots one at a time in one group and never cancels a running slot', async () => {
    const document = await scheduled();

    expect(at(document, 'concurrency')).toEqual({
      group: 'scheduled-release',
      'cancel-in-progress': false,
    });
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
  readonly slot?: string;
  /** The merge time of the head commit of main (ISO 8601, UTC). */
  readonly committed?: string;
}

/** Runs the one step of the job against a fake gh; returns its code, the gh calls and the summary. */
async function run(options: Run = {}): Promise<{ code: number; calls: string[]; summary: string }> {
  gh = await fakeGh({
    mainSha: sha,
    hour: options.hour ?? '06',
    activeRuns: options.activeRuns ?? '0',
    committed: options.committed ?? '2000-01-01T00:00:00Z',
  });
  const document = await scheduled();
  const [job = ''] = keysOf(at(document, 'jobs'));
  const summaryFile = `${gh.folder}/summary.md`;
  const env = {
    ...gh.env,
    EVENT: options.event ?? 'schedule',
    DEPLOY_ENABLED: options.enabled ?? 'true',
    SLOT: options.slot ?? '7 5 * * *',
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

  // The fake date answers the Madrid hour; summer (CEST) slots 04:07 and 05:37 UTC and winter (CET)
  // slots 05:07 and 06:07 UTC both reach the 06 and 07 Madrid hours, so the gate is the same in both.
  it.each(['06', '07'])(
    'DEC-175 a scheduled run at %s in Madrid starts Release in summer and winter time',
    async (hour) => {
      const summer = await run({ hour, slot: '7 4 * * *' });
      const winter = await run({ hour, slot: '7 5 * * *' });

      expect(dispatched(summer.calls)).toBe(true);
      expect(dispatched(winter.calls)).toBe(true);
    },
  );
});

describe('scheduled-release.yml backup slots', () => {
  it('DEC-175 a scheduled run at 05 in Madrid, before the window, starts nothing', async () => {
    const result = await run({ hour: '05', slot: '7 6 * * *' });

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.summary).not.toBe('');
  });

  it('DEC-175 the step summary names the slot that started Release and its Madrid hour', async () => {
    const result = await run({ hour: '07', slot: '37 5 * * *' });

    expect(result.summary).toContain('37 5 * * *');
    expect(result.summary).toContain('Madrid');
    expect(result.summary).toContain('07');
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

// P7-28: GitHub may start a slot after 07:59 Madrid (on 2026-10-29 it started them between 12:28 and
// 13:53). Such a late slot deploys when the head commit of main was merged before 06:00 Madrid, so a
// delayed schedule deploys late rather than not at all. The fake commit dates are far from the real
// clock: 2000 is before any 06:00 cut-off and 2099 after it.
describe('scheduled-release.yml late slot', () => {
  it('P7-28 a slot that fires after 07:59 starts Release when main was merged before 06:00 that day', async () => {
    const result = await run({ hour: '13', slot: '7 5 * * *', committed: '2000-01-01T00:00:00Z' });

    expect(result.code).toBe(0);
    expect(dispatched(result.calls)).toBe(true);
    expect(result.summary).toContain('7 5 * * *');
    expect(result.summary).toContain('minutes after its slot');
  });

  it('P7-28 a late slot reads the merge time of the head commit it checks', async () => {
    const { calls } = await run({ hour: '13' });

    expect(calls).toContain(
      `api repos/blacklight0101/Rosetta/commits/${sha} --jq .commit.committer.date`,
    );
  });

  it('P7-28 a late slot starts nothing when main was merged after 06:00 that day', async () => {
    const result = await run({ hour: '13', committed: '2099-01-01T00:00:00Z' });

    expect(result.code).toBe(0);
    expect(dispatched(result.calls)).toBe(false);
    expect(result.summary).toContain(sha);
  });

  it('P7-28 a second late slot starts nothing when a Release run of that commit already exists', async () => {
    const result = await run({ hour: '13', activeRuns: '1' });

    expect(result.code).toBe(0);
    expect(dispatched(result.calls)).toBe(false);
  });

  it('P7-28 a run by hand after 07:59 starts Release without the merge-time check', async () => {
    const result = await run({
      event: 'workflow_dispatch',
      hour: '13',
      committed: '2099-01-01T00:00:00Z',
    });

    expect(dispatched(result.calls)).toBe(true);
    expect(result.calls.some((call) => call.includes('commits/' + sha))).toBe(false);
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

  it('DEC-175 a later backup slot starts nothing when a Release run of that commit already exists', async () => {
    const result = await run({ hour: '07', slot: '37 5 * * *', activeRuns: '1' });

    expect(result.code).toBe(0);
    expect(dispatched(result.calls)).toBe(false);
    expect(result.summary).toContain(sha);
  });

  // P7-28 review: a Release dispatched seconds earlier by another slot may not be listed as queued yet,
  // so a run created in the last ten minutes on that commit counts too.
  it('P7-28 also counts a Release of that commit created in the last ten minutes', async () => {
    const { calls } = await run();
    const list = calls.find((call) => call.startsWith('run list')) ?? '';

    expect(list).toContain('headSha,status,conclusion,createdAt');
    expect(list).toContain('.createdAt >= ');
  });

  it('DEC-175 starts Release again when every run of that commit failed or was cancelled', async () => {
    expect(dispatched((await run({ activeRuns: '0' })).calls)).toBe(true);
  });
});
