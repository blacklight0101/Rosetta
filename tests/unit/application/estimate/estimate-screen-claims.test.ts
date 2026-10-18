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

// RF-425, RF-626, DEC-147: the understand estimate counts the verifier calls of the claims each
// SCRN card adds (its route, roles, fields and links). A screen is a page file of an area, as the
// estimate sees it before a run. A project with no screen is estimated as it was before.

const settings = settingsFor({ reader: { provider: 'openai', model: 'priced-model' } });
const AREA_COUNT = 4;
const areas = Array.from({ length: AREA_COUNT }, (_, index) =>
  areaOf(`Area${String(index)}`, 10_000),
);

/** The first `screens` areas hold a page, the others a library. */
function filesWith(screens: number): FileEntry[] {
  return areas.map((area, index) =>
    index < screens
      ? entry(`${area.name}/File.cs`, 10, { artefactKinds: ['page'] })
      : entry(`${area.name}/File.cs`),
  );
}

async function estimateWith(screens: number) {
  const harness = createEstimateHarness(areas, filesWith(screens));
  const project = await projectWithScan(harness, userAmy.userId, settings);
  const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });
  if (!outcome.ok) throw new Error(`The estimate was refused: ${outcome.error}`);
  const roleOf = (role: string) => {
    const found = outcome.value.roles.find((each) => each.role === role);
    if (found === undefined) throw new Error(`No ${role} in the estimate`);
    return found.points.likely;
  };
  return {
    reader: roleOf('reader'),
    verifier: roleOf('verifier'),
    assumptions: outcome.value.assumptions,
  };
}

/** Verifier tokens of the 30 percent share of the readers (ADR-005), rounded up. */
const readerShare = (tokens: number): number => Math.floor((tokens * 30 + 99) / 100);

/** The verifier tokens beyond the readers' share: the screen claims, and nothing on a project without screens. */
function claimTokensOf(estimate: Awaited<ReturnType<typeof estimateWith>>) {
  return {
    input: estimate.verifier.inputTokens - readerShare(estimate.reader.inputTokens),
    output: estimate.verifier.outputTokens - readerShare(estimate.reader.outputTokens),
  };
}

describe('the understand estimate with screen claims', () => {
  it('RF-626 the claims the verifier checks grow with the number of screens', async () => {
    const estimates = await Promise.all([0, 1, 2, 3].map((screens) => estimateWith(screens)));
    const claims = estimates.map(claimTokensOf);

    claims.slice(1).forEach((after, index) => {
      const before = claims[index];
      expect(after.input).toBeGreaterThan(before?.input ?? Number.POSITIVE_INFINITY);
      expect(after.output).toBeGreaterThan(before?.output ?? Number.POSITIVE_INFINITY);
    });
  });

  it('RF-626 a project with no screen has the verifier share of the readers, as before', async () => {
    const { reader, verifier } = await estimateWith(0);

    // Verifier tokens are 30 percent of the readers' (ADR-005), rounded up.
    expect(verifier.inputTokens).toBe(Math.floor((reader.inputTokens * 30 + 99) / 100));
    expect(verifier.outputTokens).toBe(Math.floor((reader.outputTokens * 30 + 99) / 100));
  });

  it('RF-626 each screen adds its claims per screen, named and shown with the estimate', async () => {
    const none = await estimateWith(0);
    const two = await estimateWith(2);

    // Nine claims per screen (one route, two roles, four fields, two links; see estimate-assumptions),
    // each judged with a likely judgement of 1000 input and 100 output tokens (DEC-145).
    expect(two.assumptions.verifierCallsPerScreen).toBe(9);
    const extraInput = two.verifier.inputTokens - none.verifier.inputTokens;
    expect(extraInput).toBe(
      readerShare(two.reader.inputTokens) - readerShare(none.reader.inputTokens) + 2 * 9 * 1000,
    );
    const extraOutput = two.verifier.outputTokens - none.verifier.outputTokens;
    expect(extraOutput).toBe(
      readerShare(two.reader.outputTokens) - readerShare(none.reader.outputTokens) + 2 * 9 * 100,
    );
  });
});
