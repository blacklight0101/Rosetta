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
