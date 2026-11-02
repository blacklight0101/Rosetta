import { readFile } from 'node:fs/promises';
import { afterEach } from 'vitest';
import { fakeGh, type FakeGh } from './fake-gh.js';
import { at, keysOf, runStep, stepScript, workflowDocument } from './workflow-yaml.js';

// DEC-175, P8-13: runs the one step of .github/workflows/scheduled-release.yml against a fake gh and
// date. Importing this file registers an afterEach that removes the fake gh folders.

export const scheduled = (): Promise<unknown> => workflowDocument('scheduled-release.yml');
export const sha = '0123456789abcdef0123456789abcdef01234567';

const made: FakeGh[] = [];
afterEach(async () => {
  await Promise.all(made.splice(0).map((gh) => gh.dispose()));
});

/** A fake gh whose folder is removed after the test. */
export async function trackedGh(options: Parameters<typeof fakeGh>[0] = {}): Promise<FakeGh> {
  const gh = await fakeGh({ mainSha: sha, ...options });
  made.push(gh);
  return gh;
}

export interface Run {
  readonly event?: string;
  readonly hour?: string;
  readonly enabled?: string;
  readonly activeRuns?: string;
  readonly slot?: string;
  /** The merge time of the head commit of main (ISO 8601, UTC). */
  readonly committed?: string;
  /** The instant (ISO 8601, UTC) the fake date answers; the Madrid hour and day come from it. */
  readonly now?: string;
  /** A fake gh shared by several runs, the way slots queued in one concurrency group share GitHub. */
  readonly shared?: FakeGh;
}

const ghFor = (options: Run): Promise<FakeGh> =>
  options.shared === undefined
    ? trackedGh({
        hour: options.hour ?? '06',
        activeRuns: options.activeRuns ?? '0',
        committed: options.committed ?? '2000-01-01T00:00:00Z',
        ...(options.now === undefined ? {} : { now: options.now }),
      })
    : Promise.resolve(options.shared);

/** Runs the one step of the job against a fake gh; returns its code, the gh calls and the summary. */
export async function run(
  options: Run = {},
): Promise<{ code: number; calls: string[]; summary: string; zones: string[] }> {
  const gh = await ghFor(options);
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
  return { code, calls: await gh.calls(), summary, zones: await gh.zones() };
}

export const dispatched = (calls: string[]): boolean =>
  calls.includes('workflow run release.yml --ref main');
