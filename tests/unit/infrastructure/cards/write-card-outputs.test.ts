import { describe, expect, it } from 'vitest';
import { cardsOf, cardTarget, fileOf, writeCards } from '../../../support/card-output-harness.js';

describe('writeCardOutputs files', () => {
  it('RF-204 writes one Markdown file per card under cards/<TYPE>/<ID>.md', async () => {
    const { writer, result } = await writeCards(cardsOf());

    expect(result.ok).toBe(true);
    const paths = [...writer.files.keys()].map((path) => path.slice(cardTarget.folder.length + 1));
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

  it('RF-204 writing the same cards again gives the same bytes', async () => {
    const first = await writeCards(cardsOf());
    const second = await writeCards(cardsOf());

    expect([...second.writer.files]).toEqual([...first.writer.files]);
  });
});

describe('writeCardOutputs snapshots', () => {
  it('RF-204 a card file is a YAML header and a generated body (snapshot)', async () => {
    const { writer } = await writeCards(cardsOf());

    expect(fileOf(writer, 'cards/FEAT/FEAT-001.md')).toMatchSnapshot();
    expect(fileOf(writer, 'cards/OQ/OQ-001.md')).toMatchSnapshot();
  });

  it('RF-204 cards/index.json lists every card sorted by id with claim counts (snapshot)', async () => {
    const { writer } = await writeCards(cardsOf());

    expect(fileOf(writer, 'cards/index.json')).toMatchSnapshot();
  });

  it('RF-204 spec.md presents the cards per area with links to the card files (snapshot)', async () => {
    const { writer } = await writeCards(cardsOf());

    expect(fileOf(writer, 'spec.md')).toMatchSnapshot();
  });
});

describe('writeCardOutputs permalinks', () => {
  const url =
    'https://github.com/octo/demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/src/Orders/Checkout.cs#L10-L24';

  it('RF-125 every citation in a card links to the exact lines at the pinned commit', async () => {
    const { writer } = await writeCards(cardsOf());

    const card = fileOf(writer, 'cards/FEAT/FEAT-001.md');
    expect(card).toContain(`[src/Orders/Checkout.cs:10-24](${url})`);
  });

  it('RF-125 every citation in spec.md links to the exact lines at the pinned commit', async () => {
    const { writer } = await writeCards(cardsOf());

    expect(fileOf(writer, 'spec.md')).toContain(`[src/Orders/Checkout.cs:10-24](${url})`);
  });
});
