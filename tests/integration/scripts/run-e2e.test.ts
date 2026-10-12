import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

// RNF-005, P1-13: scripts/run-e2e.mjs builds the front end and runs the Playwright project against
// a disposable database. In CI mode it is part of `npm run test:ci` on Linux only, and only where a
// database is configured; everywhere else it says so and succeeds. Run on its own it needs a
// database and fails clearly without one.

const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'run-e2e.mjs');
const withoutDatabase = { ...process.env, ROSETTA_TEST_DATABASE_URL: '' };

describe('scripts/run-e2e.mjs', () => {
  it('RNF-005 in CI mode it skips with a notice when no database is configured', async () => {
    const { stdout } = await run('node', [script, '--ci'], { env: withoutDatabase });

    expect(stdout).toMatch(/end-to-end tests skipped/u);
    expect(stdout).toContain('ROSETTA_TEST_DATABASE_URL');
  });

  it('RNF-005 on its own it fails and names the missing database variable', async () => {
    const attempt = run('node', [script], { env: withoutDatabase });

    await expect(attempt).rejects.toMatchObject({ code: 1 });
    await expect(attempt).rejects.toThrow(/ROSETTA_TEST_DATABASE_URL/u);
  });
});
