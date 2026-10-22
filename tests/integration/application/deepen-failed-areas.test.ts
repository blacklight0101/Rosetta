import { describe, expect, it } from 'vitest';
import { claimsOf, completedRun, deepenOf } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// RF-209, RST-1303, EV-10: a Deepen offers the areas whose task ended without a usable card. The
// Catalog task and its retry end on a repeated call (a sequence trimmed from the Asset Manager
// evaluation); the area has no rejected claim and opened every file, so only the failed-area rule
// brings it into the Deepen. Recorded answers only.

const temp = useTempRoot('rosetta-deepen-failed-');

async function deepenedAfterFailure(coveragePass: boolean) {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording: 'deepen-failed-area.json',
    verifierRecording: 'verifier-deepen-failed-area.json',
  });
  const deepen = await h.deepen(run, { coveragePass });
  if (!deepen.ok) throw new Error(deepen.error);
  return { h, run, deep: deepen.value };
}

describe('RF-209 a Deepen over an area that failed', UNDERSTAND_TIMEOUT, () => {
  it('RST-1303 reads the failed area by default, even with the coverage pass off', async () => {
    const { h, run, deep } = await deepenedAfterFailure(false);

    expect(run.failedAreas).toBe(1);
    expect((await claimsOf(h, deep)).map((claim) => claim.claimId)).toEqual([
      'BR-001.c1',
      'BR-002.c1',
    ]);
    const [round] = (await deepenOf(h, deep)).rounds;
    expect(round?.failedAreas).toEqual(['Catalog']);
    expect(round?.newClaims.map((claim) => claim.status)).toEqual(['Supported']);
  });

  it('RF-209 announces the failed areas of the round', async () => {
    const { h, deep } = await deepenedAfterFailure(true);

    const started = (await h.eventsOf(deep)).find((event) => event.type === 'deepen.round.started');
    expect(started?.data).toMatchObject({ failedAreas: ['Catalog'] });
  });

  it('RST-1303 the reader of the failed area is given a note naming the files not read in full', async () => {
    const { h } = await deepenedAfterFailure(false);

    const asked = h.providers.requests().filter((r) => r.context.agentTaskId === 'reader-003');
    const first = asked[0]?.messages[0]?.content ?? '';
    expect(first).toContain('repeated');
    expect(first.split('\n')).toContain('Catalog/Details.aspx.cs');
  });
});
