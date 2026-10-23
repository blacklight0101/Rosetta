import { describe, expect, it } from 'vitest';
import type { Area } from '../../../../src/domain/code-map/area.js';
import { entry } from '../../../support/code-map-builders.js';
import {
  areaOf,
  createEstimateHarness,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// P3-123: without an area list the estimate covers the own code, as a run does.

const local = settingsFor({
  reader: { provider: 'ollama', model: 'gemma4:e4b' },
  verifier: { provider: 'ollama', model: 'gemma4:e4b' },
});

describe('P3-123 the default estimate', () => {
  it('P3-123 without an area list the totals are for the own code and the list still offers every area', async () => {
    const vendored = entry('Scripts/jquery-3.4.1.js', 900);
    const own = entry('Catalog/List.aspx.cs', 500);
    const areas: readonly Area[] = [
      { ...areaOf('Catalog', 500), files: [own.path] },
      { ...areaOf('Scripts#1', 900), files: [vendored.path] },
    ];
    const harness = createEstimateHarness(areas, [vendored, own]);
    const project = await projectWithScan(harness, userAmy.userId, local);
    const request = { actor: userAmy, projectId: project.id };

    const byDefault = await harness.estimate.execute(request);
    const own1 = await harness.estimate.execute({ ...request, areas: ['Catalog'] });
    const both = await harness.estimate.execute({ ...request, areas: ['Catalog', 'Scripts#1'] });

    expect(byDefault.ok && byDefault.value.areas.map((each) => each.name)).toEqual([
      'Catalog',
      'Scripts#1',
    ]);
    expect(byDefault.ok && byDefault.value.total).toEqual(own1.ok && own1.value.total);
    expect(byDefault.ok && byDefault.value.libraryAreas).toBe(0);
    expect(both.ok && both.value.libraryAreas).toBe(1);
  });
});
