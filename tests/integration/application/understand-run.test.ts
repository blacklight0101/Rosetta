import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { fullUnderstandRun, readJson } from '../../support/understand-full-run.js';

// RF-200, RF-203, RF-300, RF-302, RF-240, ADR-008: an understand run over every area of the C#
// fixture, after a scan, with the real prompts, tools, guards and writers and a recorded reader.

const temp = useTempRoot('rosetta-understand-');

const task = (n: number, area: string, turns: number, cards: number) => ({
  agentTaskId: `reader-00${String(n)}`,
  area,
  role: 'reader',
  state: 'Done',
  turns,
  cards,
});

describe('an understand run on the C# fixture: tasks', () => {
  it('RF-200 plans one reader task per area, runs each with the reader role and completes', async () => {
    const { h, run } = await fullUnderstandRun(temp.path);

    expect(run.endState).toBe('Completed');
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks).toEqual([
      task(1, '(root)', 2, 2),
      task(2, 'Catalog', 1, 1),
      task(3, 'Controllers', 1, 0),
      task(4, 'Database', 1, 1),
      task(5, 'Services', 3, 1),
    ]);
    expect(h.providers.requests().every((request) => request.context.role === 'reader')).toBe(true);
    expect(manifest.codemapHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(manifest.source.commitSha).toBe('c'.repeat(40));
  });
});

describe('an understand run on the C# fixture: cards', () => {
  it('RF-203 writes the cards with ids in area order, the index and spec.md', async () => {
    const { folder } = await fullUnderstandRun(temp.path);

    expect(await readJson(join(folder, 'cards', 'index.json'))).toMatchObject({
      cards: [
        { id: 'BR-001', area: 'Catalog' },
        { id: 'BR-002', area: 'Services' },
        { id: 'ENT-001', area: 'Database' },
        { id: 'FEAT-001', area: '(root)' },
        { id: 'OQ-001', area: '(root)' },
      ],
    });
    const spec = await readFile(join(folder, 'spec.md'), 'utf8');
    expect(spec.indexOf('Area: \\(root\\)')).toBeLessThan(spec.indexOf('Area: Catalog'));
  });

  it('RF-202 an area whose reader answered no card is named in spec.md and logged as suspicious', async () => {
    const { h, folder } = await fullUnderstandRun(temp.path);

    const spec = await readFile(join(folder, 'spec.md'), 'utf8');
    expect(spec).toContain('## Areas without cards');
    expect(spec).toContain('- Controllers');
    const warning = h.logger.entries.find((entry) => entry.message.includes('no card'));
    expect(warning).toMatchObject({ level: 'warn', agentTaskId: 'reader-003' });
  });
});

describe('an understand run on the C# fixture: citations', () => {
  it('RF-300 RF-302 a citation outside its file or of an unknown file makes its claim CitationInvalid, kept with the reason', async () => {
    const { folder } = await fullUnderstandRun(temp.path);

    const card = await readFile(join(folder, 'cards', 'BR', 'BR-001.md'), 'utf8');
    expect(card).toContain('claimId: "BR-001.c1"');
    expect(card).toMatch(/claimId: "BR-001\.c2"[\s\S]*status: "CitationInvalid"/u);
    expect(card).toContain('ends after the last line of the file (10).');
    expect(card).toContain('Catalog/Missing.cs is not a file of the code map.');
    expect(await readJson(join(folder, 'cards', 'index.json'))).toMatchObject({
      cards: [
        { id: 'BR-001', claimCounts: { Proposed: 1, CitationInvalid: 2 } },
        { id: 'BR-002', claimCounts: { Proposed: 1, CitationInvalid: 0 } },
      ],
    });
  });
});

describe('an understand run on the C# fixture: open questions', () => {
  it('RF-240 writes the open questions to the project answers.md with an empty answer', async () => {
    const { h, run } = await fullUnderstandRun(temp.path);

    const answers = await readFile(join(h.projectFolder(), 'answers.md'), 'utf8');
    expect(answers).toContain(
      '## OQ-001 - Is a catalog item with zero stock still shown on the home page?',
    );
    expect(answers).toContain(`- Card: runs/${run.runKey}/cards/OQ/OQ-001.md`);
    expect(answers).toContain('- Context: Default.aspx.cs:10-10 ');
    expect(answers).toContain('- Answer:\n');
  });
});
