import { describe, expect, it } from 'vitest';
import type { FileEntry } from '../../../../src/domain/code-map/file-entry.js';
import { entry } from '../../../support/code-map-builders.js';
import {
  areaOf,
  createEstimateHarness,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-263, RF-427, Q-25: the estimate use case counts flows and screens for the areas whose files
// the code map marks as entry points or pages, with the same three roles as before.

const settings = settingsFor({ reader: { provider: 'openai', model: 'priced-model' } });
const areas = [areaOf('Orders', 10_000), areaOf('Services', 10_000)];

const page = (path: string): FileEntry => entry(path, 10, { artefactKinds: ['page'] });

async function readerTokensOf(files: readonly FileEntry[]): Promise<number> {
  const harness = createEstimateHarness(areas, files);
  const project = await projectWithScan(harness, userAmy.userId, settings);
  const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });
  if (!outcome.ok) throw new Error(`The estimate was refused: ${outcome.error}`);
  const roles = outcome.value.roles.map((role) => role.role);
  expect(roles).toEqual(['reader', 'verifier', 'summariser']);
  const reader = outcome.value.roles.find((role) => role.role === 'reader');
  return (reader?.points.likely.inputTokens ?? 0) + (reader?.points.likely.outputTokens ?? 0);
}

describe('the estimate with flows and screens', () => {
  const library = [entry('Orders/File.cs'), entry('Services/File.cs')];

  it('RF-263 an area holding a page costs more than the same area holding only a library', async () => {
    const withPage = [page('Orders/File.cs'), entry('Services/File.cs')];

    expect(await readerTokensOf(withPage)).toBeGreaterThan(await readerTokensOf(library));
  });

  it('Q-25 each marked area is charged on its own: a second page area adds the same again', async () => {
    const one = [page('Orders/File.cs'), entry('Services/File.cs')];
    const both = [page('Orders/File.cs'), page('Services/File.cs')];

    const first = (await readerTokensOf(one)) - (await readerTokensOf(library));
    const second = (await readerTokensOf(both)) - (await readerTokensOf(one));

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first);
  });
});
