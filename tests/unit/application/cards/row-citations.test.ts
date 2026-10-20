import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { mapRowCitations, rowSpans } from '../../../../src/application/cards/row-citations.js';

// RF-202 (Q-47): a citation that names rows of a rendered workbook file becomes the lines that
// start with those rows; a row that is not found leaves the citation as written (it is then
// dropped by the citation check).

const lines = [
  'R1 | A1 "Rate"',
  'R2 | A2 0.05',
  'R2 | C2 0.07',
  'R3 | A3 "Total"',
  'R8 | A8 "Payment"',
  'R9 | A9 "End"',
];
const path = 'Loan.xlsx/Sheet1/values.md';

const lookup = (wanted: string) => Promise.resolve(wanted === path ? rowSpans(lines) : undefined);

function answer(...citations: string[]): string {
  return JSON.stringify({ cards: [{ claims: [{ text: 'x', citations }] }] });
}

async function mapped(...citations: string[]): Promise<readonly string[]> {
  const text = await mapRowCitations(answer(...citations), lookup);
  const parsed = z
    .object({
      cards: z.array(z.object({ claims: z.array(z.object({ citations: z.array(z.string()) })) })),
    })
    .parse(JSON.parse(text));
  return parsed.cards[0]?.claims[0]?.citations ?? [];
}

describe('rowSpans', () => {
  it('RF-202 gives the first and last line of each row, a long row spanning its lines', () => {
    const spans = rowSpans(lines);

    expect(spans.get(1)).toEqual({ first: 1, last: 1 });
    expect(spans.get(2)).toEqual({ first: 2, last: 3 });
    expect(spans.get(8)).toEqual({ first: 5, last: 5 });
    expect(spans.has(4)).toBe(false);
  });

  it('RF-202 lines that do not start with a row prefix hold no row', () => {
    expect(rowSpans(['# Sheet', 'R1x | no', 'text R2 | no']).size).toBe(0);
  });
});

describe('mapRowCitations', () => {
  it('RF-202 maps path:R8 to the lines of that row', async () => {
    expect(await mapped(`${path}:R8`)).toEqual([`${path}:5-5`]);
  });

  it('RF-202 maps a long row to all its lines', async () => {
    expect(await mapped(`${path}:R2`)).toEqual([`${path}:2-3`]);
  });

  it('RF-202 maps path:R8-R9 and path:R2-R8 from the first line of the first row to the last of the last', async () => {
    expect(await mapped(`${path}:R8-R9`, `${path}:R2-R8`)).toEqual([`${path}:5-6`, `${path}:2-5`]);
  });

  it('RF-202 accepts the range with the second row written as a bare number', async () => {
    expect(await mapped(`${path}:R8-9`)).toEqual([`${path}:5-6`]);
  });
});

describe('mapRowCitations and what it leaves alone', () => {
  it('RF-202 leaves a citation whose row is not in the file as written', async () => {
    expect(await mapped(`${path}:R5`, `${path}:R2-R5`, `${path}:R9-R2`)).toEqual([
      `${path}:R5`,
      `${path}:R2-R5`,
      `${path}:R9-R2`,
    ]);
  });

  it('RF-202 leaves a citation of a file that cannot be read as written', async () => {
    expect(await mapped('Other.xlsx/Sheet1/values.md:R2')).toEqual([
      'Other.xlsx/Sheet1/values.md:R2',
    ]);
  });

  it('RF-202 leaves line citations and line text alone', async () => {
    const citations = [`${path}:2-3`, `${path}:R2 | C2 0.05`, 'src/A.cs:7'];

    expect(await mapped(...citations)).toEqual(citations);
  });

  it('RF-202 changes only whole citation strings, not claim text that mentions a row', async () => {
    const text = JSON.stringify({
      cards: [{ claims: [{ text: `see ${path}:R8`, citations: [] }] }],
    });

    expect(await mapRowCitations(text, lookup)).toBe(text);
  });

  it('RF-202 reads each file once however many citations name it', async () => {
    const asked: string[] = [];
    const counting = (wanted: string) => {
      asked.push(wanted);
      return lookup(wanted);
    };

    await mapRowCitations(answer(`${path}:R1`, `${path}:R3`, `${path}:R8`), counting);

    expect(asked).toEqual([path]);
  });
});
