import { describe, expect, it } from 'vitest';
import { claimOf, claimsOf, completedRun, deepenOf } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// P3-125, RF-209, DEC-19, HB-06: a recorded Deepen over a recorded understand run. The re-read states the
// rejected Catalog claim three times; the card ends with the rejected claim and one replacement, and the
// run log counts the claims that were not added. Recorded answers only.

const temp = useTempRoot('rosetta-deepen-restated-');

async function deepened() {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording: 'deepen-extends-restated.json',
    verifierRecording: 'verifier-deepen-extends.json',
  });
  const deepen = await h.deepen(run, { coveragePass: false });
  if (!deepen.ok) throw new Error(deepen.error);
  return { h, deep: deepen.value };
}

describe('P3-125 a Deepen that states a rejected claim again', UNDERSTAND_TIMEOUT, () => {
  it('HB-06 adds one replacement and no near-duplicate, and keeps the distinct Supported claim', async () => {
    const { h, deep } = await deepened();

    expect((await claimsOf(h, deep)).map((claim) => [claim.claimId, claim.status])).toEqual([
      ['BR-001.c1', 'Rejected'],
      ['BR-001.c2', 'Supported'],
      ['BR-002.c1', 'Supported'],
    ]);
    expect(await claimOf(h, deep, 'BR-001.c2')).toMatchObject({ replaces: 'BR-001.c1' });
  });

  it('DEC-19 keeps the rejected claim with its verdict', async () => {
    const { h, deep } = await deepened();

    const kept = await claimOf(h, deep, 'BR-001.c1');
    expect(kept.status).toBe('Rejected');
    expect(kept.verdict?.reason).toContain('never load the catalog');
  });

  it('HB-06 records one new claim in the round', async () => {
    const { h, deep } = await deepened();

    const [round] = (await deepenOf(h, deep)).rounds;
    expect(round?.newClaims).toEqual([
      { claimId: 'BR-001.c2', status: 'Supported', replaces: 'BR-001.c1' },
    ]);
  });

  it('P3-125 counts the replaced claims in the run log, under the task', async () => {
    const { h, deep } = await deepened();

    const events = await h.eventsOf(deep);

    const replaced = events.filter((event) => event.type === 'agent.claims.replaced');
    expect(replaced.map((event) => [event.agentTaskId, event.data])).toEqual([
      ['reader-003', { count: 3, folded: 1, rejected: 2, citationsDropped: 0 }],
    ]);
  });
});
