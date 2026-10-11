import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'test-levels.mjs');

async function writeTests(root: string, level: string, count: number): Promise<void> {
  const folder = join(root, 'tests', level);
  await mkdir(folder, { recursive: true });
  const body = Array.from(
    { length: count },
    (_, i) => `it('RNF-005 case ${String(i)}', () => {});`,
  );
  await writeFile(join(folder, 'sample.test.ts'), body.join('\n'));
}

describe('scripts/test-levels.mjs', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rosetta-levels-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('RNF-005 prints the three counts with shares for a 6 / 3 / 1 tree', async () => {
    await writeTests(root, 'unit', 6);
    await writeTests(root, 'integration', 3);
    await writeTests(root, 'e2e', 1);

    const { stdout } = await run('node', [script, root]);

    expect(stdout).toContain('Unit 6 / Integration 3 / E2E 1');
    expect(stdout).toContain('60% / 30% / 10%');
    expect(stdout).not.toContain('WARNING');
  });

  it('RNF-005 warns but still succeeds when the shares leave the 60 / 30 / 10 band', async () => {
    await writeTests(root, 'unit', 1);
    await writeTests(root, 'integration', 1);
    await writeTests(root, 'e2e', 1);

    const { stdout } = await run('node', [script, root]);

    expect(stdout).toContain('Unit 1 / Integration 1 / E2E 1');
    expect(stdout).toContain('WARNING');
  });

  it('RNF-005 fails when the run counts zero tests', async () => {
    await expect(run('node', [script, root])).rejects.toThrow(/counted zero tests/u);
  });
});
