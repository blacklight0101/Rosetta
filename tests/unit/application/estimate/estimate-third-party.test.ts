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

// RF-1001, RF-425 (P1-147): the estimate says which areas hold only vendored or minified files, so
// the start page can leave them unticked.

const local = settingsFor({
  reader: { provider: 'ollama', model: 'gemma4:e4b' },
  verifier: { provider: 'ollama', model: 'gemma4:e4b' },
});

describe('RF-1001 third-party areas', () => {
  it('RF-1001 marks the areas that hold only vendored or minified files, and no other', async () => {
    const vendored = entry('Scripts/jquery-3.4.1.js', 900);
    const minified = entry('Scripts/app.min.js', 100);
    const own = entry('Catalog/List.aspx.cs', 500);
    const areas: readonly Area[] = [
      { ...areaOf('Catalog', 500), files: [own.path] },
      { ...areaOf('Scripts#1', 1000), files: [vendored.path, minified.path] },
    ];
    const harness = createEstimateHarness(areas, [vendored, minified, own]);
    const project = await projectWithScan(harness, userAmy.userId, local);

    const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });

    expect(outcome.ok && outcome.value.areas).toEqual([
      { name: 'Catalog', estimatedTokens: 500, thirdParty: false },
      { name: 'Scripts#1', estimatedTokens: 1000, thirdParty: true },
    ]);
  });
});
