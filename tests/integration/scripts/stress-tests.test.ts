import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { childEnv, makeSandbox, runNode, type Sandbox } from '../../support/vitest-sandbox.js';

// P8-142 (DEC-227, RNF-005): on a pull request that adds or changes a test file, the stress job runs
// only those tests several times, in parallel and in shuffled order (Vitest --sequence.shuffle with
// --repeats, Playwright --repeat-each on more workers), with no retry: one failed run fails the job.

const stress = join(process.cwd(), 'scripts', 'stress-tests.mjs');
const runE2e = join(process.cwd(), 'scripts', 'run-e2e.mjs');
const planOf = z.array(
  z.object({ tool: z.enum(['vitest', 'playwright']), args: z.array(z.string()) }),
);

const dryRun = (files: unknown): NodeJS.ProcessEnv =>
  childEnv({
    ROSETTA_STRESS_FILES: JSON.stringify(files),
    ROSETTA_STRESS_SEED: '42',
    ROSETTA_STRESS_DRY_RUN: '1',
  });

describe('scripts/stress-tests.mjs, the plan', () => {
  it('RNF-005 runs the changed Vitest files five times shuffled and the changed specs five times on four workers, no retry', async () => {
    const files = [
      'tests/unit/domain/a.test.ts',
      'tests/unit/web/b.test.tsx',
      'tests/e2e/c.spec.ts',
      'tests/e2e/support/helper.ts',
      'src/domain/x.ts',
    ];
    const result = await runNode(stress, [], { cwd: process.cwd(), env: dryRun(files) });

    expect(result.code).toBe(0);
    expect(planOf.parse(JSON.parse(result.stdout))).toEqual([
      {
        tool: 'vitest',
        args: [
          'run',
          'tests/unit/domain/a.test.ts',
          'tests/unit/web/b.test.tsx',
          '--sequence.shuffle',
          '--sequence.seed=42',
          '--repeats=4',
          '--retry=0',
        ],
      },
      {
        tool: 'playwright',
        args: ['tests/e2e/c.spec.ts', '--repeat-each=5', '--workers=4', '--retries=0'],
      },
    ]);
  });

  it('RNF-005 with no test file to stress it says so and succeeds at once', async () => {
    const result = await runNode(stress, [], {
      cwd: process.cwd(),
      env: childEnv({ ROSETTA_STRESS_FILES: JSON.stringify(['docs/README.md']) }),
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No test files to stress');
  });
});

describe('scripts/stress-tests.mjs, the files it picks', () => {
  it('RNF-005 skips test files no Vitest project includes, so the run never ends on "no test files"', async () => {
    const files = [
      'tests/unit/domain/a.test.ts',
      'tests/unit/a.test.tsx',
      'tests/compose/b.test.ts',
      'tests/support/c.test.ts',
      'tests/e2e/d.test.ts',
      'tests/integration/e.test.ts',
    ];
    const result = await runNode(stress, [], { cwd: process.cwd(), env: dryRun(files) });

    expect(result.code).toBe(0);
    expect(planOf.parse(JSON.parse(result.stdout))[0]?.args.slice(1, 4)).toEqual([
      'tests/unit/domain/a.test.ts',
      'tests/e2e/d.test.ts',
      'tests/integration/e.test.ts',
    ]);
  });
});

describe('scripts/stress-tests.mjs, its input', () => {
  it('RNF-005 a list that is not a JSON array of paths is refused', async () => {
    const result = await runNode(stress, [], {
      cwd: process.cwd(),
      env: childEnv({ ROSETTA_STRESS_FILES: 'tests/a.test.ts' }),
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('ROSETTA_STRESS_FILES');
  });
});

let sandbox: Sandbox | undefined;
afterEach(async () => {
  await sandbox?.remove();
  sandbox = undefined;
});

describe('scripts/stress-tests.mjs, a real run', { timeout: 120_000 }, () => {
  it('RNF-005 a test that fails one run out of five fails the stress run', async () => {
    sandbox = await makeSandbox(
      {
        'tests/unit/flaky.test.ts': [
          'let runs = 0;',
          "test('fails on its third run', () => {",
          '  runs += 1;',
          '  expect(runs).not.toBe(3);',
          '});',
          '',
        ].join('\n'),
      },
      { quarantine: false },
    );
    const env = childEnv({ ROSETTA_STRESS_FILES: JSON.stringify(['tests/unit/flaky.test.ts']) });
    const result = await runNode(stress, [], { cwd: sandbox.root, env });

    expect(result.code).not.toBe(0);
    expect(result.stdout).toMatch(/seed/iu);
  });

  it('RNF-005 a stable test runs five times and passes', async () => {
    sandbox = await makeSandbox(
      {
        'tests/unit/stable.test.ts': [
          "import { appendFileSync } from 'node:fs';",
          "test('counts its runs', () => {",
          "  appendFileSync('runs.log', 'run\\n');",
          '});',
          '',
        ].join('\n'),
      },
      { quarantine: false },
    );
    const env = childEnv({ ROSETTA_STRESS_FILES: JSON.stringify(['tests/unit/stable.test.ts']) });
    const result = await runNode(stress, [], { cwd: sandbox.root, env });
    const runs = (await readFile(join(sandbox.root, 'runs.log'), 'utf8')).trim().split('\n');

    expect(result.code).toBe(0);
    expect(runs).toHaveLength(5);
  });
});

describe('scripts/run-e2e.mjs with only the queue spec (RF-1108)', () => {
  it('RNF-005 a stress run of the queue spec alone runs it alone, repeated, and not the whole project', async () => {
    const env = childEnv({
      ROSETTA_TEST_DATABASE_URL: '',
      ROSETTA_E2E_DRY_RUN: '1',
      ROSETTA_E2E_DRY_RUN_ACK: '1',
      ROSETTA_E2E_DRY_RUN_PLAN: '1',
    });
    const args = [
      'tests/e2e/start-run-queue.spec.ts',
      '--repeat-each=5',
      '--workers=4',
      '--retries=0',
    ];
    const result = await runNode(runE2e, args, { cwd: process.cwd(), env });

    expect(z.array(z.array(z.string())).parse(JSON.parse(result.stdout))).toEqual([
      [
        'test',
        'tests/e2e/start-run-queue.spec.ts',
        '--project',
        'queue',
        '--workers=1',
        '--output',
        'test-results/queue',
        '--repeat-each=5',
        '--retries=0',
      ],
    ]);
  });
});
