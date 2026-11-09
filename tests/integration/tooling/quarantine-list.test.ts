/* eslint-disable n/no-missing-import -- the rule does not resolve .mjs; scripts/quarantine.d.mts declares the module */
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quarantineProblems } from '../../../scripts/quarantine.mjs';

// P8-142 (DEC-227, RNF-005): the guard of tests/quarantine.json. It runs in the required `verify`, so
// an entry past its last day, or one without an owner, an issue or the run that confirmed the flake,
// turns CI red until the test is fixed, the date is renewed in a reviewed change, or the entry goes.

const listFile = join(process.cwd(), 'tests', 'quarantine.json');
/** Today in UTC, the date the entries' `until` is compared with. */
const today = (): string => new Date().toISOString().slice(0, 10);

const readList = async (): Promise<unknown> => JSON.parse(await readFile(listFile, 'utf8'));
const exists = (path: string): Promise<boolean> =>
  access(join(process.cwd(), path)).then(
    () => true,
    () => false,
  );

describe('tests/quarantine.json', () => {
  it('RNF-005 every quarantined test has an owner, an issue, a flake run and a date not passed', async () => {
    expect(quarantineProblems(await readList(), today())).toEqual([]);
  });

  it('RNF-005 every quarantined test names a test file that still exists', async () => {
    const list = await readList();
    const files = Array.isArray(list)
      ? list.map((entry: unknown) =>
          typeof entry === 'object' && entry !== null && 'file' in entry ? String(entry.file) : '',
        )
      : [];
    const missing = [];
    for (const file of files) if (!(await exists(file))) missing.push(file);

    expect(missing).toEqual([]);
  });
});
