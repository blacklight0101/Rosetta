import { describe, expect, it } from 'vitest';
import { transitionClaim, type Card } from '../../../../src/domain/cards/card.js';
import { assignCardIds } from '../../../../src/domain/cards/card-ids.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { writeCardOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { cardSource, draftOf, twoAreas } from '../../../support/card-fixtures.js';
import { FailingMasker } from '../../../support/failing-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';

const target = { userId: 'u1', folder: 'projects/p/runs/20261012-100000-understand' };
const verdict = {
  step: 'judgement',
  reason: 'The lines show a different rule.',
  model: 'fake-model',
  at: '2026-10-12T10:00:00.000Z',
} as const;

function cardsOf(tasks = twoAreas()): readonly Card[] {
  const cards = assignCardIds(tasks);
  if (!cards.ok) throw new Error('fixture');
  return cards.value;
}

async function write(cards: readonly Card[], masker = new SecretMasker()) {
  const writer = new MemoryOutputWriter();
  const result = await writeCardOutputs(writer, target, { cards, source: cardSource, masker });
  return { writer, result };
}

function file(writer: MemoryOutputWriter, path: string): string {
  return writer.files.get(`${target.folder}/${path}`) ?? '';
}

describe('writeCardOutputs', () => {
  it('RF-204 writes one Markdown file per card under cards/<TYPE>/<ID>.md', async () => {
    const { writer, result } = await write(cardsOf());

    expect(result.ok).toBe(true);
    const paths = [...writer.files.keys()].map((path) => path.slice(target.folder.length + 1));
    expect(paths.sort()).toEqual([
      'cards/BR/BR-001.md',
      'cards/BR/BR-002.md',
      'cards/ENT/ENT-001.md',
      'cards/FEAT/FEAT-001.md',
      'cards/FEAT/FEAT-002.md',
      'cards/FEAT/FEAT-003.md',
      'cards/OQ/OQ-001.md',
      'cards/index.json',
      'spec.md',
    ]);
  });

  it('RF-204 a card file is a YAML header and a generated body (snapshot)', async () => {
    const { writer } = await write(cardsOf());

    expect(file(writer, 'cards/FEAT/FEAT-001.md')).toMatchSnapshot();
    expect(file(writer, 'cards/OQ/OQ-001.md')).toMatchSnapshot();
  });

  it('RF-204 cards/index.json lists every card sorted by id with claim counts (snapshot)', async () => {
    const { writer } = await write(cardsOf());

    expect(file(writer, 'cards/index.json')).toMatchSnapshot();
  });

  it('RF-204 spec.md presents the cards per area with links to the card files (snapshot)', async () => {
    const { writer } = await write(cardsOf());

    expect(file(writer, 'spec.md')).toMatchSnapshot();
  });

  it('RF-125 every citation links to the exact lines on GitHub at the pinned commit', async () => {
    const { writer } = await write(cardsOf());

    const url =
      'https://github.com/octo/demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/src/Orders/Checkout.cs#L10-L24';
    expect(file(writer, 'cards/FEAT/FEAT-001.md')).toContain(
      `[src/Orders/Checkout.cs:10-24](${url})`,
    );
    expect(file(writer, 'spec.md')).toContain(url);
  });

  it('RF-302 a rejected claim is written with its status and reason, never dropped', async () => {
    const [first, ...rest] = cardsOf();
    if (first === undefined) throw new Error('fixture');
    const rejected = transitionClaim(first, 'FEAT-001.c1', 'Rejected', verdict);
    if (!rejected.ok) throw new Error('fixture');

    const { writer } = await write([rejected.value, ...rest]);

    const text = file(writer, 'cards/FEAT/FEAT-001.md');
    expect(text).toContain('status: "Rejected"');
    expect(text).toContain('The lines show a different rule.');
    expect(file(writer, 'cards/index.json')).toContain('"Rejected": 1');
    expect(file(writer, 'spec.md')).toContain('Rejected');
    expect(text).toContain('Checkout creates an order from the basket.');
  });

  it('RF-302 writing the same cards again gives the same bytes', async () => {
    const first = await write(cardsOf());
    const second = await write(cardsOf());

    expect([...second.writer.files]).toEqual([...first.writer.files]);
  });

  it('RF-141 secrets in model text are masked in every file', async () => {
    const claims = [
      {
        text: `Config sets key ${fakeOpenAiKey}.`,
        citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }],
      },
    ];
    const tasks = [
      { agentTaskId: 't', area: 'x', drafts: [draftOf({ title: `Key ${fakeOpenAiKey}`, claims })] },
    ];

    const { writer } = await write(cardsOf(tasks));

    for (const text of writer.files.values()) expect(text).not.toContain(fakeOpenAiKey);
    expect(file(writer, 'cards/FEAT/FEAT-001.md')).toContain('[MASKED:api-key]');
  });

  it('RF-141 a masker that fails writes nothing', async () => {
    const masker = new FailingMasker();
    const writer = new MemoryOutputWriter();

    const attempt = writeCardOutputs(writer, target, {
      cards: cardsOf(),
      source: cardSource,
      masker,
    });

    await expect(attempt).rejects.toBeInstanceOf(RosettaError);
    expect(writer.writes).toEqual([]);
  });

  it('RF-204 model text cannot add Markdown structure or YAML keys', async () => {
    const title = 'Evil\n---\nstatus: Supported\n# Heading';
    const tasks = [{ agentTaskId: 't', area: 'x', drafts: [draftOf({ title })] }];

    const { writer } = await write(cardsOf(tasks));

    const text = file(writer, 'cards/FEAT/FEAT-001.md');
    expect(text.split('\n').filter((line) => line === '---')).toHaveLength(2);
    expect(text.split('\n').filter((line) => line.startsWith('# '))).toHaveLength(1);
  });
});
