import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';

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
  const tmp = useTempRoot('rosetta-levels-');

  it('RNF-005 prints the three counts with shares for a 6 / 3 / 1 tree', async () => {
    await writeTests(tmp.path, 'unit', 6);
    await writeTests(tmp.path, 'integration', 3);
    await writeTests(tmp.path, 'e2e', 1);

    const { stdout } = await run('node', [script, tmp.path]);

    expect(stdout).toContain('Unit 6 / Integration 3 / E2E 1');
    expect(stdout).toContain('60% / 30% / 10%');
    expect(stdout).not.toContain('WARNING');
  });

  it('RNF-005 warns but still succeeds when the shares leave the 60 / 30 / 10 band', async () => {
    await writeTests(tmp.path, 'unit', 1);
    await writeTests(tmp.path, 'integration', 1);
    await writeTests(tmp.path, 'e2e', 1);

    const { stdout } = await run('node', [script, tmp.path]);

    expect(stdout).toContain('Unit 1 / Integration 1 / E2E 1');
    expect(stdout).toContain('WARNING');
  });

  it('RNF-005 fails when the run counts zero tests', async () => {
    await expect(run('node', [script, tmp.path])).rejects.toThrow(/counted zero tests/u);
  });
});

describe('scripts/test-levels.mjs Playwright specs', () => {
  const tmp = useTempRoot('rosetta-levels-spec-');

  it('RNF-005 counts the tests of *.spec.ts files in the e2e folder', async () => {
    const folder = join(tmp.path, 'tests', 'e2e');
    await mkdir(folder, { recursive: true });
    const lines = [
      "test.describe('smoke', () => {",
      "  test('RNF-005 first', async ({ page }) => {});",
      "  test('RNF-005 second', async ({ page }) => {});",
      '});',
    ];
    await writeFile(join(folder, 'smoke.spec.ts'), lines.join('\n'));

    const { stdout } = await run('node', [script, tmp.path]);

    expect(stdout).toContain('Unit 0 / Integration 0 / E2E 2');
  });
});

describe('scripts/test-levels.mjs skipped tests', () => {
  const tmp = useTempRoot('rosetta-levels-skip-');

  it('RNF-005 does not count skipped or todo tests, nor tests inside describe.skip', async () => {
    const folder = join(tmp.path, 'tests', 'unit');
    await mkdir(folder, { recursive: true });
    const lines = [
      "it('RNF-005 counted', () => {});",
      "it.skip('RNF-005 skipped', () => {});",
      "test.skip('RNF-005 skipped too', () => {});",
      "it.todo('RNF-005 todo');",
      "describe.skip('suite', () => {",
      "  it('RNF-005 inside a skipped suite', () => {});",
      '});',
      "it('RNF-005 counted again', () => {});",
    ];
    await writeFile(join(folder, 'sample.test.ts'), lines.join('\n'));

    const { stdout } = await run('node', [script, tmp.path]);

    expect(stdout).toContain('Unit 2 / Integration 0 / E2E 0');
  });

  it('RNF-005 a one-line describe.skip does not hide the tests after it', async () => {
    const folder = join(tmp.path, 'tests', 'unit');
    await mkdir(folder, { recursive: true });
    const lines = [
      "describe.skip('suite', () => { it('RNF-005 inside a one-line skipped suite', () => {}); });",
      "it('RNF-005 counted after the one-line suite', () => {});",
      "describe('suite', () => {",
      "  it('RNF-005 counted in a later suite', () => {});",
      '});',
    ];
    await writeFile(join(folder, 'sample.test.ts'), lines.join('\n'));

    const { stdout } = await run('node', [script, tmp.path]);

    expect(stdout).toContain('Unit 2 / Integration 0 / E2E 0');
  });
});
