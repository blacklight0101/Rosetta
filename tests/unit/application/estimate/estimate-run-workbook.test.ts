import { describe, expect, it } from 'vitest';
import { userAmy } from '../../../support/run-harness.js';
import {
  createEstimateHarness,
  estimatePrices,
  catalogAreas,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';

// RF-155, RF-425: the estimate of an understand run counts the workbook guidance for the areas
// inside the workbook folders the scan lists, and for no other area.

const settings = settingsFor({ reader: { provider: 'openai', model: 'priced-model' } });

async function readerInput(workbookFolders: readonly string[]): Promise<number> {
  const h = createEstimateHarness(catalogAreas, [], estimatePrices, workbookFolders);
  const project = await projectWithScan(h, userAmy.userId, settings);
  const outcome = await h.estimate.execute({
    actor: userAmy,
    projectId: project.id,
  });
  if (!outcome.ok) throw new Error('The estimate was refused');
  return outcome.value.roles.find((role) => role.role === 'reader')?.points.likely.inputTokens ?? 0;
}

describe('the run estimate over a zip with workbooks', () => {
  it('RF-155 counts more reader input for an area inside a workbook folder', async () => {
    const without = await readerInput([]);

    const withFolder = await readerInput(['Catalog']);

    expect(withFolder).toBeGreaterThan(without);
  });

  it('RF-155 a folder none of whose files is in an area changes nothing', async () => {
    expect(await readerInput(['Elsewhere'])).toBe(await readerInput([]));
  });
});
