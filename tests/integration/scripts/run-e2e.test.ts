import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// RNF-005, P1-13: scripts/run-e2e.mjs builds the front end and runs the Playwright project against
// a disposable database. In CI mode it is part of `npm run test:ci` on Linux only, and only where a
// database is configured; everywhere else it says so and succeeds. Run on its own it needs a
// database and fails clearly without one. In the CI verify job ROSETTA_E2E_OWN_JOB=1 skips it too,
// because the sharded e2e jobs run the project.

const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'run-e2e.mjs');
const shardMap = z.record(z.string(), z.array(z.string()));
const withoutDatabase = { ...process.env, ROSETTA_TEST_DATABASE_URL: '', ROSETTA_E2E_OWN_JOB: '' };
const inOwnJob = {
  ...process.env,
  ROSETTA_TEST_DATABASE_URL: 'postgres://unused',
  ROSETTA_E2E_OWN_JOB: '1',
};

describe('scripts/run-e2e.mjs', () => {
  it('RNF-005 in CI mode it skips with a notice when no database is configured', async () => {
    const { stdout } = await run('node', [script, '--ci'], { env: withoutDatabase });

    expect(stdout).toMatch(/End-to-end tests skipped/u);
    expect(stdout).toContain('ROSETTA_TEST_DATABASE_URL');
  });

  it('RNF-005 in CI mode it skips with a notice when the e2e jobs run the project', async () => {
    const { stdout } = await run('node', [script, '--ci'], { env: inOwnJob });

    expect(stdout).toMatch(/End-to-end tests skipped: the e2e jobs of the workflow run them/u);
  });

  it('RNF-005 on its own it fails and names the missing database variable', async () => {
    const attempt = run('node', [script], { env: withoutDatabase });

    await expect(attempt).rejects.toMatchObject({ code: 1 });
    await expect(attempt).rejects.toThrow(/ROSETTA_TEST_DATABASE_URL/u);
  });
});

describe('scripts/run-e2e.mjs --shard selection (RNF-005)', () => {
  const dryRun = { ...withoutDatabase, ROSETTA_E2E_DRY_RUN: '1', ROSETTA_E2E_DRY_RUN_ACK: '1' };

  it('RNF-005 a shard runs exactly the spec files that shards.json gives it', async () => {
    const { stdout } = await run('node', [script, '--shard=2/3'], { env: dryRun });
    const map = shardMap.parse(
      JSON.parse(await readFile(join(process.cwd(), 'tests', 'e2e', 'shards.json'), 'utf8')),
    );

    expect(JSON.parse(stdout)).toEqual(map['2']);
  });

  it('RNF-005 a shard the map does not have is refused with a plain message', async () => {
    const attempt = run('node', [script, '--shard=4/3'], { env: withoutDatabase });

    await expect(attempt).rejects.toMatchObject({ code: 1 });
    await expect(attempt).rejects.toThrow(/has no spec files for shard 4/u);
  });

  it('RNF-005 an empty shard is refused, so it cannot run every spec in every shard', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rosetta-shards-'));
    try {
      await mkdir(join(root, 'tests', 'e2e'), { recursive: true });
      await writeFile(join(root, 'tests', 'e2e', 'shards.json'), JSON.stringify({ 1: [] }));
      const attempt = run('node', [script, '--shard=1/3'], { cwd: root, env: dryRun });

      await expect(attempt).rejects.toMatchObject({ code: 1 });
      await expect(attempt).rejects.toThrow(/has no spec files for shard 1/u);
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});

describe('scripts/run-e2e.mjs dry run needs an acknowledgement (RNF-005)', () => {
  it('RNF-005 a dry run without ROSETTA_E2E_DRY_RUN_ACK refuses loudly and runs no tests', async () => {
    const attempt = run('node', [script, '--shard=1/3'], {
      env: { ...withoutDatabase, ROSETTA_E2E_DRY_RUN: '1' },
    });

    await expect(attempt).rejects.toMatchObject({ code: 1 });
    await expect(attempt).rejects.toThrow(/no tests run/u);
  });

  it('RNF-005 an acknowledged dry run says it runs no tests', async () => {
    const { stderr } = await run('node', [script, '--shard=1/3'], {
      env: { ...withoutDatabase, ROSETTA_E2E_DRY_RUN: '1', ROSETTA_E2E_DRY_RUN_ACK: '1' },
    });

    expect(stderr).toContain('DRY RUN, no tests run');
  });
});

const queueSpec = 'tests/e2e/start-run-queue.spec.ts';
const planEnv = {
  ...withoutDatabase,
  ROSETTA_E2E_DRY_RUN: '1',
  ROSETTA_E2E_DRY_RUN_ACK: '1',
  ROSETTA_E2E_DRY_RUN_PLAN: '1',
};

/** The Playwright argument lists a dry run plans for a shard (RF-1108). */
async function plannedInvocations(shard: string): Promise<string[][]> {
  const { stdout } = await run('node', [script, `--shard=${shard}/3`], { env: planEnv });
  return z.array(z.array(z.string())).parse(JSON.parse(stdout));
}

async function shardFiles(shard: string): Promise<string[]> {
  const map = shardMap.parse(
    JSON.parse(await readFile(join(process.cwd(), 'tests', 'e2e', 'shards.json'), 'utf8')),
  );
  return map[shard] ?? [];
}

describe('scripts/run-e2e.mjs plans the queue spec alone on the shard that owns it (RF-1108, #771)', () => {
  it('RF-1108 the owning shard runs its other tests first, then the queue spec alone with one worker', async () => {
    const plan = await plannedInvocations('2');
    const files = (await shardFiles('2')).filter((file) => file !== queueSpec);

    expect(plan).toEqual([
      ['test', ...files, '--grep-invert', '@queue'],
      ['test', queueSpec, '--project', 'queue', '--workers=1', '--output', 'test-results/queue'],
    ]);
  });

  it('RF-1108 a shard that does not own the queue spec runs one invocation and never the queue', async () => {
    const plan = await plannedInvocations('3');

    expect(plan).toEqual([['test', ...(await shardFiles('3'))]]);
  });
});

/** The exit code of a finished child process, from the error execFile raises for a non-zero one. */
function exitCodeOf(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number'
  ) {
    return error.code;
  }
  return 1;
}

/**
 * Runs the owning shard with the Playwright CLI replaced by a stub that records each call and exits
 * with the code given for its invocation. Returns the exit code of the run and the recorded calls.
 */
async function runWithStubbedPlaywright(exits: {
  readonly main: string;
  readonly queue: string;
}): Promise<{ readonly code: number; readonly calls: readonly (readonly string[])[] }> {
  const root = await mkdtemp(join(tmpdir(), 'rosetta-queue-'));
  try {
    const stub = join(root, 'playwright-stub.mjs');
    await writeFile(
      stub,
      [
        "import { appendFileSync } from 'node:fs';",
        'const args = process.argv.slice(2);',
        'appendFileSync(process.env.STUB_LOG, JSON.stringify(args) + String.fromCharCode(10));',
        "process.exit(args.includes('queue') ? Number(process.env.STUB_QUEUE_EXIT) : Number(process.env.STUB_MAIN_EXIT));",
        '',
      ].join('\n'),
    );
    const log = join(root, 'calls.log');
    const env = {
      ...process.env,
      ROSETTA_TEST_DATABASE_URL: 'postgres://unused',
      ROSETTA_E2E_OWN_JOB: '',
      ROSETTA_E2E_PLAYWRIGHT_CLI: stub,
      STUB_LOG: log,
      STUB_MAIN_EXIT: exits.main,
      STUB_QUEUE_EXIT: exits.queue,
    };
    const code = await run('node', [script, '--shard=2/3'], { env }).then(
      () => 0,
      (error: unknown) => exitCodeOf(error),
    );
    const lines = (await readFile(log, 'utf8')).trim().split('\n');
    return {
      code,
      calls: lines.map((line) => z.array(z.string()).parse(JSON.parse(line))),
    };
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

describe('scripts/run-e2e.mjs runs the queue spec after the other tests and combines the exit codes (RF-1108, #771)', () => {
  it.each([
    { main: '0', queue: '0', exit: 0, why: 'both pass' },
    { main: '1', queue: '0', exit: 1, why: 'the first invocation fails' },
    { main: '0', queue: '1', exit: 1, why: 'the queue invocation fails' },
  ])(
    'RF-1108 the run exits with $exit when $why, and both invocations run in order',
    async ({ main, queue, exit }) => {
      const outcome = await runWithStubbedPlaywright({ main, queue });

      expect(outcome.code).toBe(exit);
      expect(outcome.calls).toHaveLength(2);
      expect(outcome.calls[0]).toContain('--grep-invert');
      expect(outcome.calls[1]).toContain('queue');
    },
    120_000,
  );
});
