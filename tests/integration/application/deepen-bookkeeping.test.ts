import { describe, expect, it } from 'vitest';
import { claimsOf, completedRun } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// P3-110, RF-209, RF-300, EV-26: a Deepen re-read that writes a claim restating a card id and citing a
// block tag instead of a file has that claim dropped and counted; the claim beside it is judged.

const temp = useTempRoot('rosetta-deepen-bookkeeping-');

describe('a Deepen reader that writes a bookkeeping claim', UNDERSTAND_TIMEOUT, () => {
  it('EV-26 the claim is counted in the run log and never becomes a CitationInvalid claim', async () => {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-extends-bookkeeping.json',
      verifierRecording: 'verifier-deepen-extends.json',
    });
    const deepen = await h.deepen(run, { coveragePass: false });
    if (!deepen.ok) throw new Error(deepen.error);

    const events = await h.eventsOf(deepen.value);
    const dropped = events.filter((event) => event.type === 'agent.claims.dropped');
    expect(dropped.map((event) => event.data['count'])).toEqual([1]);
    const claims = await claimsOf(h, deepen.value);
    expect(claims.map((claim) => claim.claimId)).toEqual(['BR-001.c1', 'BR-001.c2', 'BR-002.c1']);
    expect(claims.some((claim) => claim.status === 'CitationInvalid')).toBe(false);
  });
});
