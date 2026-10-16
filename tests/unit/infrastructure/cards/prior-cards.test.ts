import { describe, expect, it } from 'vitest';
import { FilePriorCards } from '../../../../src/infrastructure/cards/prior-cards.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-241, data-model.md section 3.7: the earlier cards read back from their files, and the one edit a
// re-run makes: an open question becomes answered, in its header and in its body.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const runKey = '20261012-100000-understand';
const folder = `projects/${project.projectId}/runs/${runKey}`;

const card = (state: string) =>
  [
    '---',
    'schemaVersion: 1',
    'id: "OQ-001"',
    'type: "OQ"',
    'title: "Hidden items"',
    'area: "(root)"',
    'claims:',
    '  - claimId: "OQ-001.c1"',
    '    text: "The page shows what the list returns."',
    `questionState: "${state}"`,
    '---',
    '',
    '# OQ-001 Hidden items',
    '',
    '## Question',
    '',
    `State: ${state}`,
    '',
  ].join('\n');

function setup(state = 'Open') {
  const writer = new MemoryOutputWriter();
  writer.files.set(`${folder}/cards/OQ/OQ-001.md`, card(state));
  writer.files.set(
    `${folder}/cards/index.json`,
    JSON.stringify({ cards: [{ path: 'cards/OQ/OQ-001.md' }, { path: '../../../secret.md' }] }),
  );
  return { writer, cards: new FilePriorCards(writer) };
}

describe('the earlier cards of a run', () => {
  it('RF-241 reads the cards the index lists, with area, claims and state', async () => {
    const { cards } = setup();

    expect(await cards.cardsOf(project, runKey)).toEqual([
      {
        ...{ id: 'OQ-001', type: 'OQ', title: 'Hidden items', area: '(root)' },
        claims: ['The page shows what the list returns.'],
        questionState: 'Open',
      },
    ]);
  });

  it('RF-241 reads nothing for a run key that is not a run folder name', async () => {
    const { cards } = setup();

    expect(await cards.cardsOf(project, '../other')).toEqual([]);
    expect(await cards.markAnswered(project, '../other', ['OQ-001'])).toEqual([]);
  });

  it('RF-241 marks an open question answered in its header and body, once', async () => {
    const { writer, cards } = setup();

    expect(await cards.markAnswered(project, runKey, ['OQ-001'])).toEqual(['OQ-001']);
    expect(writer.files.get(`${folder}/cards/OQ/OQ-001.md`)).toBe(card('Answered'));
    expect(await cards.markAnswered(project, runKey, ['OQ-001'])).toEqual([]);
  });

  it('RF-241 marks only card ids of open questions, never another path', async () => {
    const { cards } = setup();

    expect(await cards.markAnswered(project, runKey, ['../index', 'FEAT-001', 'OQ-002'])).toEqual(
      [],
    );
  });
});

describe('the guards of the earlier cards, over a writer that accepts any path', () => {
  it('RF-241 never marks a file that a card id with a path in it would reach', async () => {
    const { writer, cards } = setup();
    const outside = `${folder}/cards/OQ/../index.md`;
    writer.files.set(outside, card('Open'));

    expect(await cards.markAnswered(project, runKey, ['../index'])).toEqual([]);
    expect(writer.files.get(outside)).toBe(card('Open'));
  });

  it('RF-241 reads only the card files of the index, not another file it lists', async () => {
    const { writer, cards } = setup();
    writer.files.set(`${folder}/spec.md`, card('Open'));
    writer.files.set(
      `${folder}/cards/index.json`,
      JSON.stringify({ cards: [{ path: 'spec.md' }] }),
    );

    expect(await cards.cardsOf(project, runKey)).toEqual([]);
  });
});
