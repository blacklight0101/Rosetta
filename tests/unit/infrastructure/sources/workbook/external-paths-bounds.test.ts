import { expect, it } from 'vitest';
import { showExternalNames } from '../../../../../src/infrastructure/sources/workbook/external-names.js';
import { growthOf, growthStep, maxGrowth } from '../../../../support/stopwatch.js';

// RF-151, ADR-013, Q-38: a formula is untrusted text with no length cap in the file, so the rewrite of
// its external paths must stay linear. Each shape below is built with a count n at n/16 and at n and
// must grow about linearly: a quadratic reader grows about 256 times on sixteen times the input. The
// largest inputs are one to two million characters, which the file itself does not cap. The reader takes
// the formula in chunks of 32,768 characters (MAX_FORMULA_CHARS), and every small input is at least two
// chunks long, so the check proves that the work grows linearly with the number of chunks and that
// state carried across chunk boundaries is not re-read; work that is quadratic only inside one chunk is
// bounded by that cap and cannot show here. Every shape holds a quote or a bracket, or the reader returns
// at once without reading the text (MAY_HOLD_EXTERNAL) and the check would prove nothing.

const LINKS = ['C:\\Users\\x\\Rates.xlsx'];

/** The time on the formula built from the large count over the time on the one built from a sixteenth of it. */
function growthOfFormula(build: (count: number) => string, largeCount: number) {
  return growthOf(
    (formula) => showExternalNames(formula, LINKS),
    build(largeCount / growthStep),
    build(largeCount),
  );
}

it.each([
  ['an unclosed quote and UNC starts', (n: number) => `'${'\\\\'.repeat(n)}`, 600_000],
  ['an unclosed quote and drive starts', (n: number) => `'${'C:/'.repeat(n)}`, 400_000],
  ['an unclosed quote and URL starts', (n: number) => `'${'http://'.repeat(n)}`, 160_000],
  ['an unclosed quote and bracket paths', (n: number) => `'${'C:/x/[R.xlsx]'.repeat(n)}`, 80_000],
  ['a word of backslashes and drive starts', (n: number) => `[${'C:\\'.repeat(n)}`, 400_000],
  ['an unclosed quote and nested brackets', (n: number) => `'${'['.repeat(n)}]`, 1_200_000],
  [
    'an unclosed quote and nested brackets with text',
    (n: number) => `'${'[a'.repeat(n)}]`,
    600_000,
  ],
  [
    'an unclosed quote, nested brackets and a path',
    (n: number) => `'${'[a'.repeat(n)}C:\\x\\R.xlsx]`,
    600_000,
  ],
  [
    'words that straddle every chunk boundary',
    (n: number) => `[${`+${'W'.repeat(32_767)}`.repeat(n)}`,
    64,
  ],
  [
    'quoted names that straddle every chunk boundary',
    (n: number) => `'${'a'.repeat(20_000)}'!A1+`.repeat(n),
    64,
  ],
  [
    'brackets that straddle every chunk boundary',
    (n: number) => `+[${'b'.repeat(30_000)}]`.repeat(n),
    64,
  ],
])('RF-151 rewrites a formula of %s in linear time', (_name, build, largeCount) => {
  const growth = growthOfFormula(build, largeCount);

  expect(growth.ratio).toBeLessThan(maxGrowth);
});

it('RF-151 hides a path inside a very long quoted name without reading the name twice', () => {
  const name = (n: number) => `'C:\\Users\\x\\[Rates.xlsx]${'a'.repeat(n)}'!A1`;
  const growth = growthOfFormula(name, 1_200_000);

  expect(showExternalNames(name(1_200_000), LINKS)).toBe(
    `'[Rates.xlsx]${'a'.repeat(1_200_000)}'!A1`,
  );
  expect(growth.ratio).toBeLessThan(maxGrowth);
});

it('RF-151 looks back before 100,000 table references once over the whole formula', () => {
  const formula = (n: number) =>
    `C:\\Users\\john-doe\\[Rates.xlsx]S!A1+${'Table1[Col]+'.repeat(n)}A1`;
  const growth = growthOfFormula(formula, 100_000);

  expect(
    showExternalNames(formula(100_000), LINKS).startsWith('[Rates.xlsx]S!A1+Table1[Col]+'),
  ).toBe(true);
  expect(growth.ratio).toBeLessThan(maxGrowth);
});
