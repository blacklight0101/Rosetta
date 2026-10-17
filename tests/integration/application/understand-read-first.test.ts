import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-206, DEC-136: an understand run in which a reader answers before it has read anything. The
// answer is refused and the reader reads (its cards are kept as ever); a reader that still reads
// nothing has its area reported "not read" in the coverage and its cards kept with the note.

const temp = useTempRoot('rosetta-read-first-');

const coverageSchema = z.object({
  areas: z.array(
    z.object({
      area: z.string(),
      note: z.string().optional(),
      files: z.array(z.object({ path: z.string(), read: z.array(z.unknown()) })),
    }),
  ),
});

async function started(recording: string): Promise<UnderstandHarness> {
  const h = await createUnderstandHarness({ dataDir: temp.path, recording });
  await h.scan();
  return h;
}

describe('a reader that answers at turn 1', UNDERSTAND_TIMEOUT, () => {
  it('RF-206 is told to read, reads its file and its cards carry no note', async () => {
    const h = await started('understand-read-first-recovers.json');

    const run = await h.understand({ areas: ['Catalog'] });

    expect(run.endState).toBe('Completed');
    const requests = h.providers.requests();
    expect(requests).toHaveLength(3);
    expect(requests[1]?.messages.at(-1)?.content).toContain('Catalog/Details.aspx');
    const folder = h.runFolder(run);
    const coverage = coverageSchema.parse(await readJson(join(folder, 'coverage.json')));
    expect(coverage.areas[0]?.note).toBeUndefined();
    expect(coverage.areas[0]?.files.some((file) => file.read.length > 0)).toBe(true);
    const card = await readFile(join(folder, 'cards', 'FEAT', 'FEAT-001.md'), 'utf8');
    expect(card).not.toContain('written without reading the area');
  });

  it('RF-206 keeps its cards with the note and reports the area as not read when it never reads', async () => {
    const h = await started('understand-read-first-refused.json');

    const run = await h.understand({ areas: ['Catalog'] });

    expect(run.endState).toBe('Completed');
    expect(h.providers.requests()).toHaveLength(3);
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks.map((task) => [task.area, task.state, task.cards])).toEqual([
      ['Catalog', 'Done', 1],
    ]);
    const folder = h.runFolder(run);
    const card = await readFile(join(folder, 'cards', 'FEAT', 'FEAT-001.md'), 'utf8');
    expect(card).toContain('note: "written without reading the area"');
    expect(card).toContain('Note: written without reading the area');
    const coverage = coverageSchema.parse(await readJson(join(folder, 'coverage.json')));
    expect(coverage.areas.map((entry) => [entry.area, entry.note])).toEqual([
      ['Catalog', 'not read'],
    ]);
    const markdown = await readFile(join(folder, 'coverage.md'), 'utf8');
    expect(markdown).toContain('not read');
    expect(markdown).toContain('## Notes');
  });
});

describe('a reader that answers at turn 1 and the budget', UNDERSTAND_TIMEOUT, () => {
  it('RF-206 the refusals are model turns like any other: the budget guard counts all three', async () => {
    const h = await started('understand-read-first-refused.json');

    const run = await h.understand({ areas: ['Catalog'] });

    const manifest = await h.manifestOf(run);
    expect(manifest.totals.calls).toBe(3);
    expect(h.providers.ledger.entries).toHaveLength(3);
  });
});
