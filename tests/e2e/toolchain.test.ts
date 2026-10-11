import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);

describe('toolchain end to end', () => {
  it('RNF-001 the level report runs as a command on the repository and prints three counts', async () => {
    const { stdout } = await run('node', ['scripts/test-levels.mjs']);

    expect(stdout).toMatch(/Unit \d+ \/ Integration \d+ \/ E2E \d+/);
  });
});
