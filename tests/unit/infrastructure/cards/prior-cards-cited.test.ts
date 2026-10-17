import { describe, expect, it } from 'vitest';
import { FilePriorCards } from '../../../../src/infrastructure/cards/prior-cards.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-1017, RF-243, data-model.md section 3.7: the files the claims of an earlier card cite, read from
// its header, so the page can tell how many cards depend on an open question.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const runKey = '20261012-100000-understand';
const folder = `projects/${project.projectId}/runs/${runKey}`;

const card = (id: string, type: string, citations: readonly string[]): string =>
  [
    '---',
    'schemaVersion: 1',
    `id: "${id}"`,
    `type: "${type}"`,
    'title: "A card"',
    'area: "Catalog"',
    'claims:',
    `  - claimId: "${id}.c1"`,
    '    text: "A claim."',
    '    citations:',
    ...citations.map((each) => `      - "${each}"`),
    '---',
    '',
    `# ${id} A card`,
    '',
  ].join('\n');

function setup(files: Readonly<Record<string, string>>) {
  const writer = new MemoryOutputWriter();
  for (const [path, text] of Object.entries(files)) writer.files.set(`${folder}/${path}`, text);
  writer.files.set(
    `${folder}/cards/index.json`,
    JSON.stringify({ cards: Object.keys(files).map((path) => ({ path })) }),
  );
  return new FilePriorCards(writer);
}

describe('the files an earlier card cites', () => {
  it('RF-1017 reads the file of every citation of every claim, each file once', async () => {
    const cards = setup({
      'cards/BR/BR-001.md': card('BR-001', 'BR', ['Orders/Order.cs:3-9', 'Orders/Order.cs:20-30']),
      'cards/ENT/ENT-001.md': card('ENT-001', 'ENT', ['Models/Item.cs:1-4']),
    });

    const read = await cards.cardsOf(project, runKey);

    expect(read.map((each) => [each.id, each.cited])).toEqual([
      ['BR-001', ['Orders/Order.cs']],
      ['ENT-001', ['Models/Item.cs']],
    ]);
  });

  it('RF-1017 keeps a path that holds a colon whole and ignores a citation with no lines', async () => {
    const cards = setup({
      'cards/BR/BR-001.md': card('BR-001', 'BR', ['a:b/c.cs:4-5', 'broken']),
    });

    const [first] = await cards.cardsOf(project, runKey);

    expect(first?.cited).toEqual(['a:b/c.cs']);
  });
});
