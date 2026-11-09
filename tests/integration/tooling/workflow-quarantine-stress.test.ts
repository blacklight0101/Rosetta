import { describe, expect, it } from 'vitest';
import { ci, ciJob, jobIds } from '../../support/workflow-files.js';

// P8-142 (DEC-227, RNF-001, RNF-005): two jobs of ci.yml outside the required checks. `quarantine` runs
// only the quarantined tests and reports them; `stress` runs the test files a pull request adds or
// changes five times, shuffled and in parallel. `test-picks` decides cheaply whether either has work.
// The eight required check names stay as they are.

const required = [
  'verify (ubuntu-latest)',
  'verify (windows-latest)',
  'e2e',
  'audit',
  'gitleaks',
  'dependency-review',
  'pr-title',
  'codeql',
];
const newJobs = {
  'test-picks': 'pick quarantined and changed tests',
  quarantine: 'quarantined tests (not required)',
  stress: 'stress changed tests (not required)',
} as const;

const nameOf = (job: string): string => /^ {4}name: (.+)$/mu.exec(job)?.[1] ?? '';

describe('GitHub Actions workflows: quarantine and stress jobs, their names', () => {
  it.each(Object.entries(newJobs))(
    'RNF-001 job %s is named %j, which no required check uses',
    async (id, name) => {
      const job = await ciJob(id);

      expect(nameOf(job)).toBe(name);
      for (const check of required) {
        expect(name.startsWith(check.split(' ')[0] ?? check)).toBe(false);
      }
    },
  );

  it('RNF-001 the required aggregates do not wait for the new jobs, so those cannot hold a merge', async () => {
    expect(await ciJob('verify')).toMatch(/^ {4}needs: \[gates, tests-shard, tests\]$/mu);
    expect(await ciJob('e2e')).toMatch(/^ {4}needs: e2e-shard$/mu);
    const others = (await jobIds('ci.yml')).filter((id) => !Object.hasOwn(newJobs, id));
    for (const id of others) {
      expect(await ciJob(id)).not.toMatch(/needs:.*\b(test-picks|quarantine|stress)\b/u);
    }
  });
});

describe('GitHub Actions workflows: the pick job', () => {
  it('RNF-005 reads only the quarantine list, at depth one, and counts its entries', async () => {
    const job = await ciJob('test-picks');

    expect(job).toContain('sparse-checkout: tests/quarantine.json');
    expect(job).not.toContain('fetch-depth');
    expect(job).toContain('jq length tests/quarantine.json');
    expect(job).toContain('quarantined: ${{ steps.quarantine.outputs.count }}');
  });

  it("RNF-005 lists the pull request's own added, changed and renamed test files, not vitest --changed", async () => {
    const job = await ciJob('test-picks');

    expect(job).toMatch(/^ {6}pull-requests: read$/mu);
    expect(job).toContain('gh api --paginate "repos/$REPO/pulls/$PR/files"');
    expect(job).toContain('select(.status != "removed")');
    // Only the files the Vitest projects include (vitest.config.ts) and the Playwright specs.
    expect(job).toContain('(unit|integration|e2e)/.+\\\\.test\\\\.ts|unit/web/.+\\\\.test\\\\.tsx');
    expect(job).toContain('\\\\.spec\\\\.ts');
    expect(job).toContain('GH_TOKEN: ${{ github.token }}');
    expect(job).toContain('changed: ${{ steps.changed.outputs.files }}');
    expect(job).toContain('shell: bash');
    expect(job).not.toContain('--changed');
  });
});

describe('GitHub Actions workflows: the stress job', () => {
  it('RNF-005 is skipped when no test file changed and otherwise stresses the changed files', async () => {
    const job = await ciJob('stress');

    expect(job).toMatch(/^ {4}needs: test-picks$/mu);
    expect(job).toContain(
      "if: needs.test-picks.outputs.changed != '[]' && needs.test-picks.outputs.changed != ''",
    );
    expect(job).toContain('run: node scripts/stress-tests.mjs');
    expect(job).toContain('ROSETTA_STRESS_FILES: ${{ needs.test-picks.outputs.changed }}');
    expect(job).toContain('image: postgres:17');
    expect(job).toMatch(/^ {4}timeout-minutes: \d+$/mu);
  });
});

describe('GitHub Actions workflows: the quarantine job', () => {
  it('RNF-005 runs only when the list has an entry and the change is code, and runs the quarantined tests', async () => {
    const job = await ciJob('quarantine');

    expect(job).toMatch(/^ {4}needs: \[changes, test-picks\]$/mu);
    expect(job).toContain(
      "if: needs.changes.outputs.code != 'false' && needs.test-picks.outputs.quarantined != '0'",
    );
    expect(job).toContain('run: node scripts/quarantine-run.mjs');
    expect(job).toContain('image: postgres:17');
  });

  it('RNF-005 no job retries a test or changes the quarantine mode: one failed run counts', async () => {
    const text = await ci();

    expect(text).not.toContain('ROSETTA_QUARANTINE');
    expect(await ciJob('stress')).not.toContain('ROSETTA_E2E_RETRIES');
    expect(await ciJob('quarantine')).not.toContain('ROSETTA_E2E_RETRIES');
  });
});
