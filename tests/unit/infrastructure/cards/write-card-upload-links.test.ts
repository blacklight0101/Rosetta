import { describe, expect, it } from 'vitest';
import { renderCardFile } from '../../../../src/infrastructure/cards/card-markdown.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { cardsOf, fileOf, writeCards } from '../../../support/card-output-harness.js';

// RF-131, RF-125: the citations of an uploaded project link to Rosetta's own evidence page of the
// card (never to an external site); the links of a GitHub project do not change.

const upload = { kind: 'upload' } as const;
const masker = new SecretMasker();

function oneCard(path = 'src/Orders/Checkout.cs', type: 'BR' | 'ENT' = 'BR') {
  return cardsOf([
    {
      agentTaskId: 'task-orders',
      area: 'orders',
      drafts: [
        draftOf({
          type,
          claims: [{ text: 'A claim.', citations: [{ path, startLine: 10, endLine: 24 }] }],
        }),
      ],
    },
  ]);
}

const anchor = 'BR-001%2Ec1:src%2FOrders%2FCheckout%2Ecs%3A10-24';

describe('the card file of an uploaded project', () => {
  it('RF-131 links a citation to the card page of the report, at the citation', () => {
    const [card] = oneCard();
    if (card === undefined) throw new Error('fixture');

    const text = renderCardFile(card, upload, masker, [card]);

    expect(text).toContain(
      `- [src/Orders/Checkout.cs:10-24](../../report/card-BR-001.html#${anchor})`,
    );
    expect(text).not.toContain('github.com');
  });

  it('RF-131 keeps a path with spaces, brackets and non-ASCII characters out of the address', () => {
    const [card] = oneCard('My Docs/Pedidos (nuevo)/Envío [1].cs');
    if (card === undefined) throw new Error('fixture');

    const text = renderCardFile(card, upload, masker, [card]);

    const link = text.split('\n').find((line) => line.startsWith('- [My Docs'));
    expect(link).toBe(
      '- [My Docs/Pedidos (nuevo)/Envío \\[1\\].cs:10-24](../../report/card-BR-001.html#BR-001%2Ec1:My%20Docs%2FPedidos%20%28nuevo%29%2FEnv%C3%ADo%20%5B1%5D%2Ecs%3A10-24)',
    );
  });

  it('RF-131 shows a citation whose path leaves the project as plain text', () => {
    const [card] = oneCard('../../etc/passwd');
    if (card === undefined) throw new Error('fixture');

    const text = renderCardFile(card, upload, masker, [card]);

    expect(text).toContain('- ../../etc/passwd:10-24');
    expect(text).not.toContain('](../../report/');
  });
});

describe('spec.md and data-model.md of an uploaded project', () => {
  it('RF-131 link the citations to the card pages, one folder down from the run folder', async () => {
    const { writer } = await writeCards(oneCard(), masker, upload);

    expect(fileOf(writer, 'spec.md')).toContain(
      `([src/Orders/Checkout.cs:10-24](report/card-BR-001.html#${anchor}))`,
    );
    expect(fileOf(writer, 'spec.md')).not.toContain('github.com');
  });

  it('RF-131 link the citations of an entity in data-model.md the same way', async () => {
    const { writer } = await writeCards(oneCard('src/Product.cs', 'ENT'), masker, upload);

    expect(fileOf(writer, 'data-model.md')).toContain(
      '[src/Product.cs:10-24](report/card-ENT-001.html#ENT-001%2Ec1:src%2FProduct%2Ecs%3A10-24)',
    );
    expect(fileOf(writer, 'data-model.md')).not.toContain('github.com');
  });

  it('RF-131 write no file with a link outside Rosetta', async () => {
    const { writer } = await writeCards(cardsOf(), masker, upload);

    const external = [...writer.files.values()].filter((text) => /\]\(https?:/u.test(text));
    expect(external).toEqual([]);
  });
});

describe('the files of a GitHub project', () => {
  it('RF-125 are the same bytes whether the source says github or says nothing', async () => {
    const plain = await writeCards(cardsOf());
    const named = await writeCards(cardsOf(), masker, {
      kind: 'github',
      owner: 'octo',
      repo: 'demo',
      commitSha: { value: '3f786850e387550fdab836ed7e6dc881de23001b' },
    });

    expect([...named.writer.files]).toEqual([...plain.writer.files]);
    expect(fileOf(plain.writer, 'spec.md')).toContain(
      'https://github.com/octo/demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/src/Orders/Checkout.cs#L10-L24',
    );
  });
});
