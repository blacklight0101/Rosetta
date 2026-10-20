import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildVbaProject } from '../../../support/vba-project.js';
import {
  projectId,
  sampleBook,
  stageFiles,
  uploadedAt,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';
import { buildWorkbook } from '../../../support/workbook-fixtures.js';
import { listTree } from '../../../support/writable-temp-root.js';

// RF-153, RF-154, RF-152, RFC-005 sections 4.5 and 4.6: a published batch holds the dependency map
// next to the workbook folders, counts the macros it rendered and names a project it could not read.

const folders = useStagingFolders(afterEach);
const UNLOCK = 'unlock it in Excel and upload again';

function request() {
  return { projectId, uploadedAt, signal: new AbortController().signal };
}

async function macroBook(locked: boolean): Promise<Buffer> {
  const project = buildVbaProject({
    locked,
    modules: [{ name: 'Module1', kind: 'standard', source: 'Sub A()\r\nEnd Sub\r\n' }],
  });
  return buildWorkbook({
    sheets: [{ name: 'Data' }],
    extraParts: [{ name: 'xl/vbaProject.bin', data: project }],
  });
}

describe('DiskWorkbookStaging.publish with the dependency map', () => {
  it('RF-153 writes dependencies.md at the root of the snapshot, listing the workbooks', async () => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [['Pricing.xlsx', await sampleBook()]]);

    const published = await staging.publish(id, request());

    const files = join(dataDir, 'sources', published.key, 'files');
    expect(await listTree(files)).toContain('dependencies.md');
    const map = await readFile(join(files, 'dependencies.md'), 'utf8');
    expect(map).toContain('## Workbooks');
    expect(map).toContain('Pricing.xlsx');
  });

  it('RF-153 counts dependencies.md in the file count and the hash of the snapshot', async () => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [['Pricing.xlsx', await sampleBook()]]);

    const { key, info } = await staging.publish(id, request());

    const tree = await listTree(join(dataDir, 'sources', key, 'files'));
    expect(info.fileCount).toBe(tree.length);
    expect(tree.filter((path) => !path.includes('/'))).toEqual(['dependencies.md']);
  });
});

describe('DiskWorkbookStaging.publish with macros', () => {
  it('RF-154 records the macro modules that were rendered', async () => {
    const { staging } = await folders();
    const { id } = await stageFiles(staging, [['Macros.xlsm', await macroBook(false)]]);

    const { info, summary, skipped } = await staging.publish(id, request());

    expect(info.workbooks[0]?.counts).toMatchObject({ macroModules: 1, macrosSkipped: 0 });
    expect(summary[0]?.macroModules).toBe(1);
    expect(skipped).toEqual([]);
  });

  it('RF-154 names a workbook whose macro project is locked and still publishes the rest of it', async () => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [['Locked.xlsm', await macroBook(true)]]);

    const { key, info, skipped } = await staging.publish(id, request());

    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.name).toBe('Locked.xlsm');
    expect(skipped[0]?.reason).toContain(UNLOCK);
    expect(info.workbooks[0]?.counts).toMatchObject({ macroModules: 0, macrosSkipped: 1 });
    expect(await listTree(join(dataDir, 'sources', key, 'files'))).toContain(
      'Locked.xlsm/Data/values.md',
    );
  });
});
