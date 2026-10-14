import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { foldersWithoutProvenance } from '../../support/provenance.js';

// RNF-009, DEC-03, F-25: the provenance note of every fixture and recording folder.

describe('provenance notes of the committed folders', () => {
  it.each(['fixtures', 'recordings'])(
    'RNF-009 every folder of tests/%s has a note',
    async (name) => {
      const root = join(process.cwd(), 'tests', name);

      expect(await foldersWithoutProvenance(root)).toEqual([]);
    },
  );
});

describe('foldersWithoutProvenance', () => {
  let root = '';
  const note = `Hand-written for this repository. Licence rule RNF-009; nothing from the employer (DEC-03). ${'x'.repeat(200)}`;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rosetta-provenance-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function folder(name: string, readme?: string): Promise<void> {
    await mkdir(join(root, name), { recursive: true });
    if (readme !== undefined) await writeFile(join(root, name, 'README.md'), readme, 'utf8');
  }

  it('RNF-009 lists a folder with no README.md and keeps one with a full note', async () => {
    await folder('bare');
    await folder('noted', note);

    expect(await foldersWithoutProvenance(root)).toEqual(['bare']);
  });

  it.each([
    ['an empty note', ''],
    ['a short note', 'RNF-009 DEC-03'],
    ['a note without the licence citation', `DEC-03 ${'x'.repeat(250)}`],
    ['a note without the employer statement', `RNF-009 ${'x'.repeat(250)}`],
  ])('RNF-009 lists a folder with %s', async (_label, readme) => {
    await folder('weak', readme);

    expect(await foldersWithoutProvenance(root)).toEqual(['weak']);
  });

  it('RNF-009 ignores loose files, looks only at the folders directly under the root and sorts', async () => {
    await writeFile(join(root, 'loose.json'), '{}', 'utf8');
    await folder('b');
    await folder('a');
    await folder('a/deep/er', note);

    expect(await foldersWithoutProvenance(root)).toEqual(['a', 'b']);
  });
});
