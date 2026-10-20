import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claimOf, claimsOf, completedRun, deepenOf } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// RF-209, RF-203, DEC-158, ADR-005: a Deepen re-read is told the cards the parent run holds for its
// area. The claim it writes about the Catalog card the parent holds (BR-001) lands on BR-001, which
// keeps its id; no second card is written. The parent run stays as it was. Recorded answers only.

const temp = useTempRoot('rosetta-deepen-parent-cards-');

async function deepenedByExtending() {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording: 'deepen-extends.json',
    verifierRecording: 'verifier-deepen-extends.json',
  });
  const deepen = await h.deepen(run, { coveragePass: false });
  if (!deepen.ok) throw new Error(deepen.error);
  return { h, run, deep: deepen.value };
}

describe('RF-209 a Deepen over an area whose parent holds a card', UNDERSTAND_TIMEOUT, () => {
  it('DEC-158 writes no second card: the new claim lands on the parent card id, replacing the rejected one', async () => {
    const { h, deep } = await deepenedByExtending();

    expect((await claimsOf(h, deep)).map((claim) => claim.claimId)).toEqual([
      'BR-001.c1',
      'BR-001.c2',
      'BR-002.c1',
    ]);
    expect(await claimOf(h, deep, 'BR-001.c2')).toMatchObject({
      status: 'Supported',
      replaces: 'BR-001.c1',
    });
    expect(await claimOf(h, deep, 'BR-001.c1')).toMatchObject({ status: 'Rejected' });
  });

  it('RF-209 records the claim as new in the round, with the claim it replaces', async () => {
    const { h, deep } = await deepenedByExtending();

    const [round] = (await deepenOf(h, deep)).rounds;
    expect(round?.newClaims).toEqual([
      { claimId: 'BR-001.c2', status: 'Supported', replaces: 'BR-001.c1' },
    ]);
    expect((await deepenOf(h, deep)).after?.supportedAfterReread).toBe(1);
  });

  it('RF-204 shows the new claim in the card file of the parent card', async () => {
    const { h, deep } = await deepenedByExtending();

    const card = await readFile(join(h.runFolder(deep), 'cards', 'BR', 'BR-001.md'), 'utf8');

    expect(card).toContain('The name label shows the text Item when the page loads.');
    expect(card).toContain('BR-001.c2');
  });
});

describe('RF-209 what a Deepen over a parent card leaves', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 leaves the parent run as it was', async () => {
    const { h, run } = await deepenedByExtending();

    expect((await claimsOf(h, run)).map((claim) => claim.claimId)).toEqual([
      'BR-001.c1',
      'BR-002.c1',
    ]);
    expect((await claimOf(h, run, 'BR-001.c1')).status).toBe('Rejected');
  });

  it('DEC-158 sends the re-read the cards of its area only, as a data block', async () => {
    const { h } = await deepenedByExtending();

    const asked = h.providers
      .requests()
      .filter((request) => request.context.agentTaskId === 'reader-003');
    const first = JSON.stringify(asked[0]?.messages);
    expect(first).toContain('Details page loads the catalog');
    expect(first).toContain('BR-001');
    expect(first).not.toContain('Stock goes down by one per update');
  });

  it('RNF-004 records the version of the prompts of the Deepen in the manifest', async () => {
    const { h, deep } = await deepenedByExtending();

    const { promptVersions } = await h.manifestOf(deep);
    expect(promptVersions['reader/reread.v3.md']).toMatchObject({ version: 'v3' });
    expect(promptVersions['reader/parent-cards.v1.md']).toMatchObject({ version: 'v1' });
  });
});
