import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// P3-110, RF-230, RF-300, EV-26: a claim that restates a card id and cites a token that is no file
// never reaches the citation check; the run log counts it and the card keeps its other claim.

const temp = useTempRoot('rosetta-bookkeeping-');

describe('a reader that writes a bookkeeping claim', UNDERSTAND_TIMEOUT, () => {
  it('RF-230 the claim is dropped and counted, not marked CitationInvalid', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-bookkeeping.json',
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog'] });

    const events = await h.eventsOf(run);
    const dropped = events.filter((event) => event.type === 'agent.claims.dropped');
    expect(dropped.map((event) => event.data['count'])).toEqual([1]);
    const checked = events.filter((event) => event.type === 'verify.citation.checked');
    expect(checked.map((event) => event.data['ok'])).toEqual([true]);
    const card = await readFile(join(h.runFolder(run), 'cards', 'FEAT', 'FEAT-001.md'), 'utf8');
    expect(card).toContain('The page sets the name label.');
    expect(card).not.toContain('FEAT-009');
  });
});
