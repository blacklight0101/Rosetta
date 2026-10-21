import { describe, expect, it } from 'vitest';
import { plannedAreas } from '../../../../src/application/understand/planned-areas.js';
import type { Area } from '../../../../src/domain/code-map/area.js';

// RF-231 (Q-49), RF-155: the areas a run plans. A workbook project has no `(root)` area when its
// root holds no workbook file (only `dependencies.md`); every other source plans all its areas.

const area = (name: string, files: string[]): Area => ({
  ...{ name, files, estimatedTokens: 10, mapLevel: 'coarse', origin: 'folder' },
});
const root = area('(root)', ['dependencies.md']);
const loan = area('Loan.xlsx', ['Loan.xlsx/workbook.md', 'Loan.xlsx/Sheet1/values.md']);
const helper = area('Tools', ['Tools/Helper.cs']);
const workbookKey = `workbook__${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}@${'a'.repeat(16)}`;
const codeMap = { areas: [loan, root] };

describe('plannedAreas', () => {
  it('RF-231 leaves out an area that holds no workbook file in a workbook project', () => {
    const planned = plannedAreas({
      ...{ codeMap, source: { snapshotKey: workbookKey }, workbookFolders: ['Loan.xlsx'] },
    });

    expect(planned.map((each) => each.name)).toEqual(['Loan.xlsx']);
  });

  it('RF-231 keeps every area of a zip, even when it lists a workbook', () => {
    const planned = plannedAreas({
      codeMap: { areas: [loan, root, helper] },
      source: { snapshotKey: 'upload__x@aaaaaaaaaaaaaaaa' },
      workbookFolders: ['Loan.xlsx'],
    });

    expect(planned.map((each) => each.name)).toEqual(['Loan.xlsx', '(root)', 'Tools']);
  });

  it('RF-231 keeps every area of a GitHub repository', () => {
    const planned = plannedAreas({ codeMap, source: { snapshotKey: 'octo-demo-cccccccc' } });

    expect(planned).toEqual([loan, root]);
  });

  it('RF-231 a workbook project that lists no folder keeps its areas rather than plan none', () => {
    const planned = plannedAreas({
      codeMap,
      source: { snapshotKey: workbookKey },
      workbookFolders: [],
    });

    expect(planned).toEqual([loan, root]);
  });
});
