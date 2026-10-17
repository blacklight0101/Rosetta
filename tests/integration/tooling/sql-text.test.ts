import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanFolder } from '../../support/sql-template-scan.js';

// ADR-016, RNF-003, F-20: no file of src/infrastructure/db builds SQL text with `${}`; statements are
// constant strings (joined with `+` when they are long) and the values travel in the array.

describe('SQL text in src/infrastructure/db', () => {
  it('ADR-016 builds no statement with a template substitution', async () => {
    const { files, found } = await scanFolder(join(process.cwd(), 'src', 'infrastructure', 'db'));

    expect(files).toBeGreaterThan(20);
    expect(found).toEqual([]);
  });
});

describe('the folder scan', () => {
  let folder = '';
  const offender = 'export const Q = `select a from t where b = ${b}`;\n';

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'rosetta-sql-text-'));
    await mkdir(join(folder, 'nested', 'deeper'), { recursive: true });
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it.each(['a.ts', 'a.tsx', 'a.mts', 'a.cts', 'a.js', 'a.mjs', 'a.cjs', 'nested/deeper/a.ts'])(
    'ADR-016 finds an offender in %s',
    async (name) => {
      await writeFile(join(folder, name), offender, 'utf8');

      expect(await scanFolder(folder)).toEqual({ files: 1, found: [`${name}:1 sql-text`] });
    },
  );

  it('ADR-016 skips files that are not source and counts the clean ones', async () => {
    await writeFile(join(folder, 'notes.md'), offender, 'utf8');
    await writeFile(join(folder, '0001.sql'), 'select a from t where b = $1;', 'utf8');
    await writeFile(
      join(folder, 'clean.ts'),
      "export const Q = 'select a from t where b = $1';",
      'utf8',
    );

    expect(await scanFolder(folder)).toEqual({ files: 1, found: [] });
  });
});
