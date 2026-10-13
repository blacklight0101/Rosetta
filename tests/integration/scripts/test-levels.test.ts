import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';

const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'test-levels.mjs');

type Status = 'passed' | 'failed' | 'skipped' | 'pending' | 'todo';

// One file of a Vitest JSON report (`vitest run --reporter=json`): its path and one status per test.
interface ReportFile {
  readonly file: string;
  readonly statuses: readonly Status[];
}

const passing = (file: string, count: number): ReportFile => ({
  file,
  statuses: Array.from({ length: count }, () => 'passed' as const),
});

const oneHour = 60 * 60 * 1000;

// Writes a report whose run started at `startTime` (epoch ms), as Vitest's JSON reporter does.
async function writeReport(
  root: string,
  files: readonly ReportFile[],
  startTime: number = Date.now(),
): Promise<string> {
  const testResults = files.map(({ file, statuses }) => ({
    name: join(root, file),
    status: 'passed',
    assertionResults: statuses.map((status, i) => ({
      ancestorTitles: [],
      title: `RNF-005 case ${String(i)}`,
      status,
    })),
  }));
  const path = join(root, 'vitest-report.json');
  await writeFile(path, JSON.stringify({ startTime, testResults }));
  return path;
}

interface Outcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const outcome = z.object({ code: z.number(), stdout: z.string(), stderr: z.string() });

// Runs the script and resolves with its exit code and output, so a failing run is an assertion.
async function runScript(args: readonly string[]): Promise<Outcome> {
  try {
    const { stdout, stderr } = await run('node', [script, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error: unknown) {
    return outcome.parse(error);
  }
}

async function levels(root: string, files: readonly ReportFile[]): Promise<string> {
  const report = await writeReport(root, files);
  const result = await runScript(['--report', report, root]);
  expect(result.stderr).toBe('');
  expect(result.code).toBe(0);
  return result.stdout;
}

describe('scripts/test-levels.mjs', () => {
  const tmp = useTempRoot('rosetta-levels-');

  it('RNF-005 prints the three counts with shares for a 6 / 3 / 1 report', async () => {
    const stdout = await levels(tmp.path, [
      passing('tests/unit/a.test.ts', 6),
      passing('tests/integration/b.test.ts', 3),
      passing('tests/e2e/c.test.ts', 1),
    ]);

    expect(stdout).toContain('Unit 6 / Integration 3 / E2E 1');
    expect(stdout).toContain('60% / 30% / 10%');
    expect(stdout).not.toContain('WARNING');
  });

  it('RNF-005 warns but still succeeds when the shares leave the 60 / 30 / 10 band', async () => {
    const stdout = await levels(tmp.path, [
      passing('tests/unit/a.test.ts', 1),
      passing('tests/integration/b.test.ts', 1),
      passing('tests/e2e/c.test.ts', 1),
    ]);

    expect(stdout).toContain('Unit 1 / Integration 1 / E2E 1');
    expect(stdout).toContain('WARNING');
  });

  it('RNF-005 fails when the run counts zero tests', async () => {
    const report = await writeReport(tmp.path, []);

    const result = await runScript(['--report', report, tmp.path]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/counted zero tests/u);
  });

  it('RNF-005 fails when the Vitest report has zero tests even if Playwright specs have tests', async () => {
    const folder = join(tmp.path, 'tests', 'e2e');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'smoke.spec.ts'), "test('RNF-005 browser', async () => {});");
    const report = await writeReport(tmp.path, []);

    const result = await runScript(['--report', report, tmp.path]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/counted zero tests/u);
  });

  it('RNF-005 refuses a Vitest report left by an earlier run and says why', async () => {
    const twoHoursAgo = Date.now() - 2 * oneHour;
    const report = await writeReport(tmp.path, [passing('tests/unit/a.test.ts', 2)], twoHoursAgo);

    const result = await runScript(['--report', report, tmp.path]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/is stale/u);
    expect(result.stderr).toMatch(/run the tests again/u);
  });

  it('RNF-005 accepts a Vitest report from the current run', async () => {
    const report = await writeReport(
      tmp.path,
      [passing('tests/unit/a.test.ts', 2)],
      Date.now() - 1000,
    );

    const result = await runScript(['--report', report, tmp.path]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Unit 2 / Integration 0 / E2E 0');
  });

  it('RNF-005 fails and names the option when no Vitest report is given', async () => {
    const result = await runScript([tmp.path]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/--report/u);
  });
});

describe('scripts/test-levels.mjs executed tests', () => {
  const tmp = useTempRoot('rosetta-levels-run-');

  it('RNF-005 counts every executed test of a file, so each it.each row counts once', async () => {
    const stdout = await levels(tmp.path, [passing('tests/unit/table.test.ts', 7)]);

    expect(stdout).toContain('Unit 7 / Integration 0 / E2E 0');
  });

  it('RNF-005 counts a contract suite at the level of the file that runs it', async () => {
    const stdout = await levels(tmp.path, [
      passing('tests/unit/infrastructure/clock-contract.test.ts', 4),
      passing('tests/integration/db/run-index-contract.test.ts', 5),
    ]);

    expect(stdout).toContain('Unit 4 / Integration 5 / E2E 0');
  });

  it('RNF-005 counts the web project as unit tests (DEC-112)', async () => {
    const stdout = await levels(tmp.path, [passing('tests/unit/web/page.test.tsx', 3)]);

    expect(stdout).toContain('Unit 3 / Integration 0 / E2E 0');
  });

  it('RNF-005 counts failed tests but not skipped, pending or todo ones', async () => {
    const stdout = await levels(tmp.path, [
      {
        file: 'tests/integration/db/users.test.ts',
        statuses: ['passed', 'failed', 'skipped', 'pending', 'todo', 'passed'],
      },
    ]);

    expect(stdout).toContain('Unit 0 / Integration 3 / E2E 0');
  });
});

describe('scripts/test-levels.mjs report checks', () => {
  const tmp = useTempRoot('rosetta-levels-check-');

  it('RNF-005 fails on an executed test outside the three level folders (DEC-30)', async () => {
    const report = await writeReport(tmp.path, [passing('tests/contracts/clock.test.ts', 1)]);

    const result = await runScript(['--report', report, tmp.path]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/tests\/contracts\/clock\.test\.ts/u);
  });

  it('RNF-005 fails when the report is not a Vitest JSON report', async () => {
    const report = join(tmp.path, 'broken.json');
    await writeFile(report, JSON.stringify({ results: [] }));

    const result = await runScript(['--report', report, tmp.path]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/not a Vitest JSON report/u);
  });
});

describe('scripts/test-levels.mjs Playwright specs', () => {
  const tmp = useTempRoot('rosetta-levels-spec-');

  it('RNF-005 adds the tests of *.spec.ts files in the e2e folder to the E2E count', async () => {
    const folder = join(tmp.path, 'tests', 'e2e');
    await mkdir(folder, { recursive: true });
    const lines = [
      "test.describe('smoke', () => {",
      "  test('RNF-005 first', async ({ page }) => {});",
      "  test.skip('RNF-005 skipped', async ({ page }) => {});",
      "  test('RNF-005 second', async ({ page }) => {});",
      '});',
    ];
    await writeFile(join(folder, 'smoke.spec.ts'), lines.join('\n'));

    const stdout = await levels(tmp.path, [passing('tests/e2e/toolchain.test.ts', 1)]);

    expect(stdout).toContain('Unit 0 / Integration 0 / E2E 3');
  });
});
