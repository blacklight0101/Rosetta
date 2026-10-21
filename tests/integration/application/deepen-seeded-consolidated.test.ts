import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completedRun } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// RF-209 (Q-44): the cards a Deepen announces it starts from are the parent's cards after the
// summariser merged the duplicates of several areas (RF-250), the number the parent's own page shows,
// not the cards its reader tasks wrote. Recorded answers only.

const temp = useTempRoot('rosetta-deepen-seeded-consolidated-');

const merged = {
  schemaVersion: 1,
  types: [{ type: 'BR', cardIds: ['BR-001', 'BR-002'] }],
  merges: [{ ids: ['BR-001', 'BR-002'], title: 'Item names', summary: 'One rule for both areas.' }],
};

describe('RF-209 the cards a Deepen starts from', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 counts the parent cards after the parent consolidated them, with every claim kept', async () => {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-judge.json',
      verifierRecording: 'verifier-deepen-judge.json',
    });
    await writeFile(
      join(h.runFolder(run), 'consolidation.json'),
      `${JSON.stringify(merged, null, 2)}\n`,
    );

    const deepen = await h.deepen(run, { coveragePass: false });

    if (!deepen.ok) throw new Error(deepen.error);
    const started = (await h.eventsOf(deepen.value)).find(
      (event) => event.type === 'deepen.started',
    );
    expect(started?.data['seeded']).toEqual({
      cards: 1,
      claims: 2,
      supported: 1,
      rejected: 0,
      citationInvalid: 0,
      notJudged: 1,
    });
  });

  it('RF-209 counts the cards as written when the parent merged none', async () => {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-judge.json',
      verifierRecording: 'verifier-deepen-judge.json',
    });

    const deepen = await h.deepen(run, { coveragePass: false });

    if (!deepen.ok) throw new Error(deepen.error);
    const started = (await h.eventsOf(deepen.value)).find(
      (event) => event.type === 'deepen.started',
    );
    expect(started?.data['seeded']).toMatchObject({ cards: 2, claims: 2 });
  });
});
