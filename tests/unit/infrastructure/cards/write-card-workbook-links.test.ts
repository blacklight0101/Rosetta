import { describe, expect, it } from 'vitest';
import { pinnedSourceOf } from '../../../../src/application/understand/pinned-source.js';
import { citationLink } from '../../../../src/infrastructure/cards/citation-link.js';
import { renderCardFile } from '../../../../src/infrastructure/cards/card-markdown.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { cardsOf, fileOf, writeCards } from '../../../support/card-output-harness.js';

// RF-156, RF-131: the citations of a workbook project link to Rosetta's own evidence page of the
// card, whatever file they cite (a rendered sheet, workbook.md, dependencies.md or a macro file),
// and never to an external site.

const workbook = { kind: 'workbook' } as const;
const masker = new SecretMasker();

function oneCard(path: string) {
  return cardsOf([
    {
      agentTaskId: 'task-pricing',
      area: 'Pricing.xlsx',
      drafts: [
        draftOf({
          type: 'BR',
          claims: [{ text: 'A claim.', citations: [{ path, startLine: 3, endLine: 4 }] }],
        }),
      ],
    },
  ]);
}

describe('citationLink of a workbook project', () => {
  it.each([
    'Pricing.xlsx/Summary/formulas.md',
    'Pricing.xlsx/workbook.md',
    'dependencies.md',
    'Pricing.xlsx/macros/Module1.bas',
  ])('RF-156 links a citation to %s to the evidence page, never to GitHub', (path) => {
    const link = citationLink({ path, startLine: 3, endLine: 4 }, workbook, {
      base: '../../report/',
      cardId: 'BR-001',
      claimId: 'BR-001.c1',
    });

    expect(link).toMatch(/^\[.*\]\(\.\.\/\.\.\/report\/card-BR-001\.html#BR-001%2Ec1:/u);
    expect(link).not.toContain('github.com');
  });

  it('RF-156 shows a citation whose path leaves the project as plain text', () => {
    const link = citationLink({ path: '../outside.md', startLine: 1, endLine: 2 }, workbook, {
      base: '../../report/',
      cardId: 'BR-001',
    });

    expect(link).toBe('../outside.md:1-2');
  });
});

describe('the card files of a workbook project', () => {
  it('RF-156 link a citation in the card file to the card page of the report', () => {
    const [card] = oneCard('Pricing.xlsx/Summary/formulas.md');
    if (card === undefined) throw new Error('fixture');

    const text = renderCardFile(card, workbook, masker, [card]);

    expect(text).toContain(
      '- [Pricing.xlsx/Summary/formulas.md:3-4](../../report/card-BR-001.html#BR-001%2Ec1:Pricing%2Exlsx%2FSummary%2Fformulas%2Emd%3A3-4)',
    );
    expect(text).not.toContain('github.com');
  });

  it('RF-156 write spec.md and data-model.md with no link outside Rosetta', async () => {
    const { writer } = await writeCards(oneCard('dependencies.md'), masker, workbook);

    const external = [...writer.files.values()].filter((text) => /\]\(https?:/u.test(text));
    expect(external).toEqual([]);
    expect(fileOf(writer, 'spec.md')).toContain('(report/card-BR-001.html#');
  });
});

describe('pinnedSourceOf a workbook run', () => {
  it('RF-156 pins the citations of a workbook run to the evidence pages, with no commit', () => {
    const source = { kind: 'workbook', owner: '', repo: '' } as const;

    expect(pinnedSourceOf(source, null)).toEqual({ kind: 'upload' });
  });
});
