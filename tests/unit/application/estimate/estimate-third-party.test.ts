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

// RF-1001, RF-1018, RF-425 (P1-147, P1-172): the estimate says how many files each area holds and
// which hold only vendored or minified files, so the start page can leave them out of the list.

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
      { name: 'Catalog', estimatedTokens: 500, files: 1, thirdParty: false },
      { name: 'Scripts#1', estimatedTokens: 1000, files: 2, thirdParty: true },
    ]);
  });

  it('P3-112 does not offer an area with no readable file (zero tokens)', async () => {
    const empty = entry('Images/logo.png', 0, { lines: 0, skipped: 'binary' });
    const own = entry('Catalog/List.aspx.cs', 500);
    const areas: readonly Area[] = [
      { ...areaOf('Catalog', 500), files: [own.path] },
      { ...areaOf('Images', 0), files: [empty.path] },
    ];
    const harness = createEstimateHarness(areas, [own, empty]);
    const project = await projectWithScan(harness, userAmy.userId, local);

    const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });

    expect(outcome.ok && outcome.value.areas.map((each) => each.name)).toEqual(['Catalog']);
  });
});
