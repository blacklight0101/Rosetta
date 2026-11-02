import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-433, DEC-197, DEC-112, P8-04: "No cap for local models" lifts the project's run caps, not the
// administrator's. A run whose every role is on the fake provider (a local kind) and whose first task
// reports 49,999,000 tokens passes the 50,000,000-token ceiling with its next call, and ends
// CapReached there, far above the project's token cap of 228,000.

const temp = useTempRoot('rosetta-understand-local-ceiling-');

describe('RF-433 an all-local run ends at the administrator ceiling', UNDERSTAND_TIMEOUT, () => {
  it('RF-433 ends CapReached at the 50,000,000-token ceiling, not at the project cap', async () => {
    const settings = understandSettings((base) => ({
      ...base,
      budget: {
        ...base.budget,
        run: { maxCostMicros: 50_000_000, maxTokens: 228_000 },
        noCapForLocalModels: true,
      },
    }));
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-local-ceiling.json',
      settings,
      verifierRecording: 'verifier-all-supported.json',
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    expect(run.endState).toBe('CapReached');
    const reached = (await h.eventsOf(run)).filter((event) => event.type === 'budget.capReached');
    expect(reached).not.toEqual([]);
    expect(reached[0]?.data).toMatchObject({ scope: 'run-tokens', capTokens: 50_000_000 });
  });
});
