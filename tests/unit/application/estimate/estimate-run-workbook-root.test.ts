import { describe, expect, it } from 'vitest';
import type { Area } from '../../../../src/domain/code-map/area.js';
import { userAmy } from '../../../support/run-harness.js';
import {
  areaOf,
  createEstimateHarness,
  createWorkbookEstimateHarness,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';

// RF-231 (Q-49), RF-425: a workbook project has no `(root)` area when its root holds no workbook
// file, so the estimate does not count a reader for it; a zip with workbooks keeps its root area.

const settings = settingsFor({ reader: { provider: 'openai', model: 'priced-model' } });
const workbookKey = `workbook__${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}@${'a'.repeat(16)}`;
const root: Area = { ...areaOf('(root)', 300), files: ['dependencies.md'] };
const loan: Area = { ...areaOf('Loan.xlsx', 5_000), files: ['Loan.xlsx/workbook.md'] };

const rates: Area = { ...areaOf('Rates.xlsx', 2_000), files: ['Rates.xlsx/workbook.md'] };

async function namesOf(snapshotKey: string | undefined, two = false): Promise<readonly string[]> {
  const areas = two ? [loan, root, rates] : [loan, root];
  const folders = two ? ['Loan.xlsx', 'Rates.xlsx'] : ['Loan.xlsx'];
  const h =
    snapshotKey === undefined
      ? createEstimateHarness(areas, [], undefined, folders)
      : createWorkbookEstimateHarness(areas, folders, snapshotKey);
  const project = await projectWithScan(h, userAmy.userId, settings);
  const outcome = await h.estimate.execute({ actor: userAmy, projectId: project.id });
  if (!outcome.ok) throw new Error('The estimate was refused');
  return outcome.value.areas.map((area) => area.name);
}

describe('the run estimate over a workbook project', () => {
  it('RF-231 has no (root) area when the root holds no workbook file', async () => {
    expect(await namesOf(workbookKey)).toEqual(['Loan.xlsx']);
  });

  it('RF-231 keeps the (root) area with dependencies.md when the project has two workbooks', async () => {
    expect(await namesOf(workbookKey, true)).toEqual(['Loan.xlsx', '(root)', 'Rates.xlsx']);
  });

  it('RF-231 a zip with a workbook keeps its root area: it may hold the code beside it', async () => {
    expect(await namesOf(undefined)).toEqual(['Loan.xlsx', '(root)']);
  });
});
