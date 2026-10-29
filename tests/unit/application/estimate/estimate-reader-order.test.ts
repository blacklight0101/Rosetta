import { describe, expect, it } from 'vitest';
import { entry } from '../../../support/code-map-builders.js';
import {
  areaOf,
  createEstimateHarness,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-210 (P7-03, DEC-195): the estimate lists the areas in the order the readers take them, so the
// areas a capped run reaches are the first ones listed.

const local = settingsFor({
  reader: { provider: 'ollama', model: 'gemma4:e4b' },
  verifier: { provider: 'ollama', model: 'gemma4:e4b' },
});
const areas = [
  areaOf('.kube', 30_000),
  areaOf('Docker', 8_000),
  areaOf('Kubernetes', 12_000),
  areaOf('eShopModernizedMVC', 60_000),
  areaOf('eShopModernizedWebForms', 90_000),
];

async function listed(requested?: readonly string[]): Promise<readonly string[]> {
  const files = areas.flatMap((each) =>
    each.files.map((path) => entry(path, each.estimatedTokens)),
  );
  const harness = createEstimateHarness(areas, files);
  const project = await projectWithScan(harness, userAmy.userId, local);
  const outcome = await harness.estimate.execute({
    actor: userAmy,
    projectId: project.id,
    ...(requested === undefined ? {} : { areas: requested }),
  });
  return outcome.ok ? outcome.value.areas.map((each) => each.name) : [];
}

describe('RF-210 estimate order', () => {
  it('RF-210 lists the app areas, largest first, before the deployment areas', async () => {
    expect(await listed()).toEqual([
      'eShopModernizedWebForms',
      'eShopModernizedMVC',
      'Kubernetes',
      'Docker',
      '.kube',
    ]);
  });

  it('RF-210 lists a named subset in the same order as the run reads it', async () => {
    expect(await listed(['Docker', 'eShopModernizedMVC', 'Kubernetes'])).toEqual([
      'eShopModernizedMVC',
      'Kubernetes',
      'Docker',
    ]);
  });
});
