import { describe, expect, it } from 'vitest';
import { isCardFile, manyCards } from '../../support/large-plan-run.js';
import { createPlanEstimateHarness } from '../../support/plan-estimate-harness.js';

// RF-613, RF-1011 (P5-28): the estimate over readers that keep their parse is byte for byte the
// estimate over readers that do not, on a 450-card run, and a second estimate reads no card file.

async function estimateOf(keepParsed: boolean) {
  const harness = await createPlanEstimateHarness({
    seed: { cards: manyCards(450) },
    keepParsed,
  });
  harness.files.reads.length = 0;
  const ask = () =>
    harness.estimate.execute({ actor: harness.actor, projectId: harness.project.id });
  return { harness, ask };
}

const text = (value: unknown): string =>
  JSON.stringify(value, (_key, each: unknown) =>
    typeof each === 'bigint' ? `${String(each)}n` : each,
  );

describe('EstimatePlan over kept card parses', () => {
  it('RF-613 gives byte-equal output with and without kept parses, first and second time', async () => {
    const plain = await estimateOf(false);
    const kept = await estimateOf(true);

    const expected = text(await plain.ask());
    expect(text(await kept.ask())).toBe(expected);
    expect(text(await kept.ask())).toBe(expected);
  });

  it('RF-1011 the second estimate reads no card file', async () => {
    const { harness, ask } = await estimateOf(true);
    await ask();
    const first = harness.files.reads.filter(isCardFile).length;
    harness.files.reads.length = 0;

    await ask();

    expect(first).toBe(450);
    expect(harness.files.reads.filter(isCardFile)).toEqual([]);
  });
});
