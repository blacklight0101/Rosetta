import { describe, expect, it } from 'vitest';
import {
  MERGE_ANSWER_TOKENS,
  MERGE_BATCH_TOKENS,
  MERGE_PROMPT_TOKENS,
} from '../../../../src/application/consolidate/merge-request.js';
import { ceilPercent } from '../../../../src/application/estimate/estimate-assumptions.js';
import type { RunEstimate } from '../../../../src/application/estimate/estimate-types.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { createEstimateHarness, projectWithScan } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-425, RF-250, P2-35: the cards message to the summariser is sent in batches of a bounded size,
// one call each, so the summariser's figures count the prompt and the answer of every batch.

const priced = settingsFor({
  reader: { provider: 'openai', model: 'priced-model' },
  summariser: { provider: 'openai', model: 'priced-model' },
});

function withReader(maxOutputTokens: number, maxTurns = 10): ProjectSettings {
  const reader = { ...priced.roles.reader, maxTurns, maxOutputTokens };
  return { ...priced, roles: { ...priced.roles, reader } };
}

async function estimateOf(settings: ProjectSettings): Promise<RunEstimate> {
  const harness = createEstimateHarness();
  const project = await projectWithScan(harness, userAmy.userId, settings);
  const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });
  if (!outcome.ok) throw new Error(`The estimate was refused with ${outcome.error}`);
  return outcome.value;
}

describe('the summariser batches in the estimate', () => {
  it('RF-425 P2-35 Q-52 states the bound and the merge calls of a small run: one per type a run asks about', async () => {
    const estimate = await estimateOf(withReader(1000));

    expect(estimate.assumptions.summariserBatchTokens).toBe(MERGE_BATCH_TOKENS);
    expect(estimate.assumptions.summariserBatches).toEqual({ low: 1, likely: 2, high: 4 });
    const summariser = estimate.roles.find((role) => role.role === 'summariser');
    // The merge (2,500 in, 180 out), its second call (800 in, 500 out) and the overview call.
    const overview = estimate.assumptions.overviewOutputTokens.likely;
    expect(summariser?.points.likely).toMatchObject({
      inputTokens: 5800,
      outputTokens: 180 + 500 + overview,
    });
  });

  it('RF-425 P2-35 counts the batches of a run whose cards are larger than the bound', async () => {
    const estimate = await estimateOf(withReader(60_000, 20));

    const reader = estimate.roles.find((role) => role.role === 'reader');
    const summariser = estimate.roles.find((role) => role.role === 'summariser');
    if (reader === undefined || summariser === undefined) throw new Error('roles');
    const share = {
      inputTokens: ceilPercent(reader.points.likely.inputTokens, 10),
      outputTokens: ceilPercent(reader.points.likely.outputTokens, 10),
    };
    const batches = Math.ceil(share.outputTokens / MERGE_BATCH_TOKENS);
    expect(batches).toBeGreaterThan(1);
    expect(estimate.assumptions.summariserBatches.likely).toBe(batches);
    expect(summariser.points.likely).toMatchObject({
      inputTokens: share.inputTokens * 2 + (batches - 1) * MERGE_PROMPT_TOKENS,
      outputTokens:
        share.outputTokens +
        (batches - 1) * MERGE_ANSWER_TOKENS +
        estimate.assumptions.overviewOutputTokens.likely,
    });
  });

  it('RF-425 P2-35 the high figure has at least as many batches as the likely one, and that one as the low', async () => {
    const { summariserBatches } = (await estimateOf(withReader(60_000, 20))).assumptions;

    expect(summariserBatches.high).toBeGreaterThanOrEqual(summariserBatches.likely);
    expect(summariserBatches.likely).toBeGreaterThanOrEqual(summariserBatches.low);
  });
});
