import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claimsOf, completedRun } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// RF-250, RF-209, Q-52, P3-67: the rounds of a Deepen write cards for an area the parent already
// has cards for. When two reader tasks wrote cards of one type, the summariser compares them at the
// end of the Deepen, in one area too; a merge keeps every claim and the id of the first card, and
// the raw task results stay as the readers wrote them, so a resume makes the merge again.
// Recorded answers only: deepen-merges-within-area.json holds the summariser's merge.

const temp = useTempRoot('rosetta-deepen-consolidation-');

async function deepened(recording: string) {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording,
    verifierRecording: 'verifier-deepen-supported.json',
  });
  const deepen = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
  if (!deepen.ok) throw new Error(deepen.error);
  return { h, deep: deepen.value };
}

async function cardIds(folder: string): Promise<string[]> {
  return (await readdir(join(folder, 'cards', 'BR'))).sort();
}

describe(
  'RF-250 a Deepen that wrote a rule beside the rule the parent holds',
  UNDERSTAND_TIMEOUT,
  () => {
    it('RF-250 asks the summariser about the rules once two reader tasks wrote them, in one area too', async () => {
      const { h } = await deepened('deepen-merges-within-area.json');

      const asked = h.providers
        .requests()
        .filter((request) => request.context.role === 'summariser');
      expect(asked.map((request) => request.context.agentTaskId)).toEqual([
        'summariser-br',
        'summariser-br',
      ]);
      expect(JSON.stringify(asked[1]?.messages)).toContain('Details page loads the catalog');
    });

    it('RF-250 the two Catalog rules become one card with every claim, under the first id', async () => {
      const { h, deep } = await deepened('deepen-merges-within-area.json');

      const folder = h.runFolder(deep);
      expect(await cardIds(folder)).toEqual(['BR-001.md', 'BR-002.md']);
      const card = await readFile(join(folder, 'cards', 'BR', 'BR-001.md'), 'utf8');
      for (const text of [
        'Catalog details page',
        'The name label shows the text Item when the page loads.',
        'The details page loads the catalog from the database.',
      ]) {
        expect(card).toContain(text);
      }
      expect(card).toMatch(/mergedFrom:\n\s+- "BR-001"\n\s+- "BR-003"/u);
    });
  },
);

describe('RF-006 a Deepen whose rules were merged', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 the task results stay as the readers wrote them, and the merge is recorded', async () => {
    const { h, deep } = await deepened('deepen-merges-within-area.json');

    expect((await claimsOf(h, deep)).map((claim) => claim.claimId)).toEqual([
      'BR-001.c1',
      'BR-001.c2',
      'BR-002.c1',
      'BR-003.c1',
    ]);
    const record = await readFile(join(h.runFolder(deep), 'consolidation.json'), 'utf8');
    expect(record).toContain('"BR-003"');
    expect(JSON.parse(record)).toMatchObject({
      merges: [{ ids: ['BR-001', 'BR-003'], title: 'Catalog details page' }],
    });
  });

  it('RF-250 publishes where the claims went, and records the merge prompt version', async () => {
    const { h, deep } = await deepened('deepen-merges-within-area.json');

    const merged = (await h.eventsOf(deep)).filter((event) => event.type === 'cards.merged');
    expect(merged.map((event) => event.data['cardId'])).toEqual(['BR-001']);
    const { promptVersions } = await h.manifestOf(deep);
    expect(promptVersions['summariser/merge.v2.md']).toMatchObject({ version: 'v2' });
  });
});

describe('RF-250 a Deepen whose summariser merges nothing', UNDERSTAND_TIMEOUT, () => {
  it('RF-250 keeps every card and ends Completed', async () => {
    const { h, deep } = await deepened('deepen-extends-and-new.json');

    expect(deep.endState).toBe('Completed');
    expect(await cardIds(h.runFolder(deep))).toEqual(['BR-001.md', 'BR-002.md', 'BR-003.md']);
  });
});
