import { describe, expect, it } from 'vitest';
import { createEstimateHarness, projectWithScan } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-425, RF-250, RF-143: the summariser that merges duplicate cards is a role of the estimate, as a
// share of the readers' tokens, so its provider is named on the start page and its price counts.

const priced = settingsFor({
  reader: { provider: 'openai', model: 'priced-model' },
  summariser: { provider: 'openai', model: 'priced-model' },
});
const settings = {
  ...priced,
  roles: {
    ...priced.roles,
    reader: { ...priced.roles.reader, maxTurns: 10, maxOutputTokens: 1000 },
  },
};

describe('the summariser in the estimate', () => {
  it('RF-425 RF-250 is a share of the readers and priced like any role', async () => {
    const harness = createEstimateHarness();
    const project = await projectWithScan(harness, userAmy.userId, settings);

    const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });

    const summariser = outcome.ok ? outcome.value.roles.find((r) => r.role === 'summariser') : null;
    // 10% of the reader's 24,998 in and 1,800 out for the merge, the same input again and 1,500
    // output tokens for the overview (RF-264), and the second merge call a typical run makes (Q-52: the merge
    // prompt again, 800 in, and an answer, 500 out): 5,800 in at 250,000 and 2,180 out at 2,000,000.
    expect(summariser).toMatchObject({ provider: 'openai', model: 'priced-model', priced: true });
    expect(summariser?.points.likely).toEqual({
      inputTokens: 5800,
      outputTokens: 2180,
      costMicros: 5810n,
    });
  });

  it('RF-264 RF-425 the estimate states the overview output it assumes', async () => {
    const harness = createEstimateHarness();
    const project = await projectWithScan(harness, userAmy.userId, settings);

    const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });

    const assumed = outcome.ok ? outcome.value.assumptions.overviewOutputTokens : null;
    expect(assumed).toEqual({ low: 800, likely: 1500, high: 3000 });
  });
});
