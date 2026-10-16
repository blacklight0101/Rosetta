import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCardsLenient } from '../../../../src/application/cards/parse-cards.js';

// RF-208, DEC-138: the answers that lost areas in the owner's local runs of 2026-10-14
// (tests/recordings/owner-runs/). Each file holds the answer and its repair, `=== attempt n ===`
// apart. Every answer that holds a valid card yields it, with the invalid claims listed.

const folder = join('tests', 'recordings', 'owner-runs');

async function attemptsOf(file: string): Promise<readonly string[]> {
  const text = await readFile(join(folder, file), 'utf8');
  return text.split(/^=== attempt \d+ ===\n/mu).slice(1);
}

interface Expectation {
  readonly file: string;
  /** Per attempt: the cards kept and the problems listed. */
  readonly attempts: readonly (readonly [number, number])[];
}

const expectations: readonly Expectation[] = [
  {
    file: '145748-reader-004.txt',
    attempts: [
      [5, 2],
      [6, 0],
    ],
  },
  {
    file: '145748-reader-017.txt',
    attempts: [
      [0, 1],
      [0, 1],
    ],
  },
  {
    file: '145748-reader-022.txt',
    attempts: [
      [2, 1],
      [2, 1],
    ],
  },
  {
    file: '153115-reader-005.txt',
    attempts: [
      [3, 1],
      [3, 1],
    ],
  },
  {
    file: '153115-reader-008.txt',
    attempts: [
      [0, 1],
      [1, 0],
    ],
  },
  {
    file: '153115-reader-023.txt',
    attempts: [
      [0, 1],
      [0, 2],
    ],
  },
  {
    file: '153115-reader-031.txt',
    attempts: [
      [0, 1],
      [3, 3],
    ],
  },
  {
    file: '153115-reader-034.txt',
    attempts: [
      [3, 1],
      [3, 1],
    ],
  },
  {
    file: '154704-reader-004.txt',
    attempts: [
      [8, 2],
      [9, 1],
    ],
  },
  {
    file: '154704-reader-015.txt',
    attempts: [
      [4, 3],
      [5, 0],
    ],
  },
];

describe('the recorded answers of the owner runs', () => {
  it.each(expectations)(
    'RF-208 $file: cards kept and problems listed per attempt',
    async ({ file, attempts }) => {
      const answers = await attemptsOf(file);

      const read = answers.map((raw) => parseCardsLenient(raw));

      expect(read.map((each) => [each.drafts.length, each.problems.length])).toEqual(attempts);
    },
  );

  it('RF-208 the first answer of 154704 reader-004 keeps its valid cards although two claims are invalid', async () => {
    const [first] = await attemptsOf('154704-reader-004.txt');

    const read = parseCardsLenient(first ?? '');

    expect(read.drafts.length).toBeGreaterThan(0);
    expect(read.problems.map((problem) => problem.message).join(' ')).toMatch(/citation/iu);
  });

  it('RF-208 the first answer of 153115 reader-023, JSON with a quote inside a string, is not taken for a cut-off answer', async () => {
    const [first] = await attemptsOf('153115-reader-023.txt');

    expect(parseCardsLenient(first ?? '').cutOff).toBe(false);
  });
});
