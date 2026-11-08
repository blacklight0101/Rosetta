import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  childEnv,
  makeSandbox,
  runNode,
  vitestCli,
  type Sandbox,
} from '../../support/vitest-sandbox.js';

// P8-142 (DEC-227, RNF-005): a quarantined test is skipped by the required runs (`verify` through the
// Vitest setup file, `e2e` through Playwright's --test-list-invert), and the quarantine job runs only
// the quarantined tests (ROSETTA_QUARANTINE=only) and lists them in its job summary.

const runE2e = join(process.cwd(), 'scripts', 'run-e2e.mjs');
const quarantineRun = join(process.cwd(), 'scripts', 'quarantine-run.mjs');

const entryOf = (file: string, title: readonly string[]): Record<string, unknown> => ({
  file,
  title,
  owner: 'blacklight0101',
  issue: 1301,
  until: '2999-12-31',
  flakeRun: 'https://github.com/blacklight0101/Rosetta/actions/runs/123456789',
});
const vitestEntry = entryOf('tests/a.test.ts', ['suite', 'flaky one']);
const e2eEntry = entryOf('tests/e2e/b.spec.ts', ['journey', 'flaky step']);

const fixture = [
  "describe('suite', () => {",
  "  test('flaky one', () => { throw new Error('the flake'); });",
  "  test('stable one', () => { expect(1).toBe(1); });",
  '});',
  '',
].join('\n');

const results = z.object({
  testResults: z.array(
    z.object({ assertionResults: z.array(z.object({ title: z.string(), status: z.string() })) }),
  ),
});

/** "<title>: <status>" of every test of the Vitest JSON report of a sandbox, in a stable order. */
const statuses = async (root: string): Promise<string[]> =>
  results
    .parse(JSON.parse(await readFile(join(root, 'report.json'), 'utf8')))
    .testResults.flatMap((file) => file.assertionResults)
    .map((test) => `${test.title}: ${test.status}`)
    .sort();

let sandbox: Sandbox | undefined;
afterEach(async () => {
  await sandbox?.remove();
  sandbox = undefined;
});

/** A sandbox with the fixture test file and a quarantine list. */
async function sandboxWith(entries: readonly Record<string, unknown>[]): Promise<Sandbox> {
  sandbox = await makeSandbox(
    { 'tests/a.test.ts': fixture, 'tests/quarantine.json': JSON.stringify(entries) },
    { quarantine: true },
  );
  return sandbox;
}

const vitestArgs = ['run', '--reporter=json', '--outputFile.json=report.json', '--maxWorkers=1'];

describe('the quarantine in the required Vitest runs', { timeout: 120_000 }, () => {
  it('RNF-005 a quarantined test is skipped, so its failure does not fail the run', async () => {
    const { root } = await sandboxWith([vitestEntry]);
    const result = await runNode(vitestCli, vitestArgs, { cwd: root, env: childEnv() });

    expect(await statuses(root)).toEqual(['flaky one: skipped', 'stable one: passed']);
    expect(result.code).toBe(0);
  });

  it('RNF-005 with ROSETTA_QUARANTINE=only the run keeps only the quarantined tests', async () => {
    const { root } = await sandboxWith([vitestEntry]);
    const env = childEnv({ ROSETTA_QUARANTINE: 'only' });
    const result = await runNode(vitestCli, vitestArgs, { cwd: root, env });

    expect(await statuses(root)).toEqual(['flaky one: failed', 'stable one: skipped']);
    expect(result.code).toBe(1);
  });

  it('RNF-005 a listed title that only starts a test title does not skip that test', async () => {
    const { root } = await sandboxWith([
      entryOf('tests/a.test.ts', ['suite', 'flaky']),
      entryOf('tests/a.test.ts.bak', ['suite', 'flaky one']),
    ]);
    const result = await runNode(vitestCli, vitestArgs, { cwd: root, env: childEnv() });

    expect(await statuses(root)).toEqual(['flaky one: failed', 'stable one: passed']);
    expect(result.code).toBe(1);
  });

  it('RNF-005 with an empty list every test runs', async () => {
    const { root } = await sandboxWith([]);
    const result = await runNode(vitestCli, vitestArgs, { cwd: root, env: childEnv() });

    expect(await statuses(root)).toEqual(['flaky one: failed', 'stable one: passed']);
    expect(result.code).toBe(1);
  });
});

describe('the quarantine job (scripts/quarantine-run.mjs)', { timeout: 120_000 }, () => {
  it('RNF-005 runs only the quarantined tests, fails when one fails, and lists them in the job summary', async () => {
    const { root } = await sandboxWith([vitestEntry]);
    const summary = join(root, 'summary.md');
    const result = await runNode(quarantineRun, [], {
      cwd: root,
      env: childEnv({ GITHUB_STEP_SUMMARY: summary }),
    });
    const written = await readFile(summary, 'utf8');

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('flaky one');
    expect(result.stdout).not.toMatch(/stable one.*passed/u);
    expect(written).toContain('tests/a.test.ts › suite › flaky one');
    expect(written).toContain('blacklight0101');
    expect(written).toContain('#1301');
    expect(written).toContain('2999-12-31');
    expect(result.stdout).toContain('No quarantined Playwright tests');
  });

  it('RNF-005 with an empty list it says so and succeeds', async () => {
    const { root } = await sandboxWith([]);
    const result = await runNode(quarantineRun, [], { cwd: root, env: childEnv() });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No quarantined tests');
  });
});

const planEnv = (extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv =>
  childEnv({
    ROSETTA_TEST_DATABASE_URL: '',
    ROSETTA_E2E_OWN_JOB: '',
    ROSETTA_E2E_DRY_RUN: '1',
    ROSETTA_E2E_DRY_RUN_ACK: '1',
    ROSETTA_E2E_DRY_RUN_PLAN: '1',
    ...extra,
  });
const plan = (stdout: string): string[][] => z.array(z.array(z.string())).parse(JSON.parse(stdout));

describe('the quarantine in the e2e runs (scripts/run-e2e.mjs)', { timeout: 60_000 }, () => {
  it('RNF-005 the required run skips the quarantined Playwright tests with --test-list-invert', async () => {
    const { root } = await sandboxWith([vitestEntry, e2eEntry]);
    const result = await runNode(runE2e, ['tests/e2e/b.spec.ts', 'tests/e2e/c.spec.ts'], {
      cwd: root,
      env: planEnv(),
    });

    expect(plan(result.stdout)).toEqual([
      [
        'test',
        'tests/e2e/b.spec.ts',
        'tests/e2e/c.spec.ts',
        '--test-list-invert',
        'test-results/quarantine.txt',
      ],
    ]);
    expect(await readFile(join(root, 'test-results', 'quarantine.txt'), 'utf8')).toBe(
      'b.spec.ts › journey › flaky step\n',
    );
  });

  it('RNF-005 with ROSETTA_QUARANTINE=only it runs only the quarantined spec files, with --test-list', async () => {
    const { root } = await sandboxWith([vitestEntry, e2eEntry]);
    const result = await runNode(runE2e, [], {
      cwd: root,
      env: planEnv({ ROSETTA_QUARANTINE: 'only' }),
    });

    expect(plan(result.stdout)).toEqual([
      ['test', 'tests/e2e/b.spec.ts', '--test-list', 'test-results/quarantine.txt'],
    ]);
  });

  it('RNF-005 with ROSETTA_QUARANTINE=only and no quarantined Playwright test it runs nothing and succeeds', async () => {
    const { root } = await sandboxWith([vitestEntry]);
    const result = await runNode(runE2e, [], {
      cwd: root,
      env: planEnv({ ROSETTA_QUARANTINE: 'only' }),
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No quarantined Playwright tests');
  });
});

describe('scripts/run-e2e.mjs without a quarantine list', () => {
  it('RNF-005 without a list file nothing is skipped', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rosetta-p8142-'));
    try {
      const result = await runNode(runE2e, ['tests/e2e/b.spec.ts'], { cwd: root, env: planEnv() });

      expect(plan(result.stdout)).toEqual([['test', 'tests/e2e/b.spec.ts']]);
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});

const projectsOf = z.object({
  test: z.object({
    projects: z.array(
      z.object({
        test: z.object({
          name: z.string(),
          setupFiles: z.union([z.string(), z.array(z.string())]),
        }),
      }),
    ),
  }),
});

describe('the Vitest projects load the quarantine setup file', () => {
  it('RNF-005 every project of vitest.config.ts runs tests/support/quarantine-setup.ts', async () => {
    const config = projectsOf.parse((await import('../../../vitest.config.js')).default);
    const names = config.test.projects.map((project) => project.test.name);
    const without = config.test.projects
      .filter(({ test }) => ![test.setupFiles].flat().includes('tests/support/quarantine-setup.ts'))
      .map(({ test }) => test.name);

    expect(names).toEqual(['unit', 'web', 'integration', 'e2e']);
    expect(without).toEqual([]);
  });
});
