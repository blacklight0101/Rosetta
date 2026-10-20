import type { Card } from '../../src/domain/cards/card.js';
import { base, judgedCard } from './plan-cards.js';

// RF-155: the cards of an understand run over the pricing-workbook fixture, for the plan tests of a
// workbook project: one feature and one business rule, each with a supported claim that cites the
// rendered lines of the Quote sheet.

function cite(text: string, path: string, startLine: number, endLine: number) {
  return { text, citations: [{ path, startLine, endLine }] };
}

/** The cards the plan runs of a workbook project plan from. */
export function workbookCards(): readonly Card[] {
  const area = 'Pricing.xlsx';
  return [
    judgedCard(
      {
        ...{ ...base('FEAT-001', 'FEAT', 'Quote a price'), area },
        claims: [cite('The Quote sheet totals a quote.', 'Pricing.xlsx/Quote/formulas.md', 7, 7)],
      },
      ['Supported'],
    ),
    judgedCard(
      {
        ...{ ...base('BR-001', 'BR', 'Volume discount'), area },
        claims: [
          cite(
            'A quote of 100 units or more gets a 10% discount.',
            'Pricing.xlsx/Quote/formulas.md',
            6,
            6,
          ),
        ],
      },
      ['Supported'],
    ),
  ];
}
