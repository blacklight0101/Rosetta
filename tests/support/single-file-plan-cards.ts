import type { Card, CardInput } from '../../src/domain/cards/card.js';
import { base, claim, judgedCard } from './plan-cards.js';

// RF-612, RF-639..RF-643, P6-12: the cards of an understand run over a single-file application,
// a bill splitter that is one script (`splitbill.py`). Every claim is supported, so the plan from
// them is the small plan of the owner's own test of a single-file app (docs/reviews/
// 2026-10-28-agent-build-method.md section 1). The file and the code are synthetic (RNF-009).

function cited(text: string, startLine: number, endLine: number): CardInput['claims'][number] {
  return {
    ...claim(text, 'splitbill.py'),
    citations: [{ path: 'splitbill.py', startLine, endLine }],
  };
}

/** The cards a plan run of the single-file bill splitter plans from. */
export function singleFileCards(): readonly Card[] {
  const area = 'splitbill.py';
  return [
    judgedCard(
      {
        ...{ ...base('FEAT-001', 'FEAT', 'Split a bill'), area },
        claims: [
          cited('The script divides a bill between the people named on its command line.', 4, 18),
        ],
      },
      ['Supported'],
    ),
    judgedCard(
      {
        ...{ ...base('FEAT-002', 'FEAT', 'Print the shares'), area },
        claims: [cited("The script prints one line per person with that person's share.", 20, 27)],
      },
      ['Supported'],
    ),
    judgedCard(
      {
        ...{ ...base('BR-001', 'BR', 'Cents that do not divide evenly'), area },
        claims: [
          cited(
            'Shares are rounded down to the cent and the remainder goes to the first person.',
            10,
            14,
          ),
        ],
      },
      ['Supported'],
    ),
  ];
}
