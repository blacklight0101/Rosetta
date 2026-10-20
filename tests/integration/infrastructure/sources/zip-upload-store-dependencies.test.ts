import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bodyOf, requestOf, storeIn } from '../../../support/upload-store-harness.js';
import { buildVbaProject } from '../../../support/vba-project.js';
import { buildWorkbook } from '../../../support/workbook-fixtures.js';
import { encryptedBook, sampleBook } from '../../../support/workbook-staging-harness.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';
import { buildZip, type ZipItem } from '../../../support/zip-fixtures.js';

// RF-153, RF-154, RF-152, Q-41, RFC-005 sections 4.5 and 4.6: a zip that holds workbooks gets one
// dependency map for all of them, written where it cannot overwrite a file of the zip.

const root = useWritableTempRoot('rosetta-zip-deps-');
const UNLOCK = 'unlock it in Excel and upload again';
const SOURCE: ZipItem = { name: 'src/Orders.cs', data: 'class Orders {}' };

async function storedFrom(...items: readonly ZipItem[]) {
  const store = storeIn(root.path);
  const stored = await store.store(requestOf(bodyOf(await buildZip([SOURCE, ...items]))));
  const files = join(root.path, 'sources', stored.key, 'files');
  return { stored, files, tree: await listTree(files) };
}

describe('ZipUploadStore the dependency map of a zip', () => {
  it('RF-153 writes dependencies.md at the root, labelling workbooks by their folder in the tree', async () => {
    const { files, tree } = await storedFrom({
      name: 'docs/Pricing.xlsx',
      data: await sampleBook(),
    });

    expect(tree).toContain('dependencies.md');
    expect(tree).toContain('docs/Pricing.xlsx/workbook.md');
    expect(await readFile(join(files, 'dependencies.md'), 'utf8')).toContain('docs/Pricing.xlsx');
  });

  it('RF-153 leaves a dependencies.md of the zip as it is and writes the map beside it', async () => {
    const { files, tree } = await storedFrom(
      { name: 'dependencies.md', data: 'my own notes' },
      { name: 'Pricing.xlsx', data: await sampleBook() },
    );

    expect(await readFile(join(files, 'dependencies.md'), 'utf8')).toBe('my own notes');
    expect(tree).toContain('dependencies (workbooks).md');
    expect(await readFile(join(files, 'dependencies (workbooks).md'), 'utf8')).toContain(
      '## Workbooks',
    );
  });

  it('RF-153 writes no map for a zip whose workbooks were all left out', async () => {
    const { stored, tree } = await storedFrom({ name: 'Locked.xlsx', data: encryptedBook() });

    expect(stored.leftOut).toHaveLength(1);
    expect(tree).not.toContain('dependencies.md');
  });
});

describe('ZipUploadStore the macros of a workbook in a zip', () => {
  const macroBook = async (locked: boolean, modules: number) =>
    buildWorkbook({
      sheets: [{ name: 'Data' }],
      extraParts: [
        {
          name: 'xl/vbaProject.bin',
          data: buildVbaProject({
            locked,
            modules: Array.from({ length: modules }, (_, index) => ({
              name: `Module${String(index + 1)}`,
              kind: 'standard' as const,
              source: 'Sub A()\r\nEnd Sub\r\n',
            })),
          }),
        },
      ],
    });

  it('RF-154 records and shows the macro modules that were rendered', async () => {
    const { stored } = await storedFrom({ name: 'Macros.xlsm', data: await macroBook(false, 2) });

    expect(stored.info.workbooks?.[0]?.counts).toMatchObject({ macroModules: 2 });
    expect(stored.workbooks?.[0]?.macroModules).toBe(2);
  });

  it('RF-154 names a workbook whose macro project is locked, and keeps it rendered', async () => {
    const { stored, tree } = await storedFrom({
      name: 'Locked.xlsm',
      data: await macroBook(true, 1),
    });

    expect(stored.leftOut).toHaveLength(1);
    expect(stored.leftOut?.[0]?.name).toBe('Locked.xlsm');
    expect(stored.leftOut?.[0]?.reason).toContain(UNLOCK);
    expect(tree).toContain('Locked.xlsm/Data/values.md');
  });
});
