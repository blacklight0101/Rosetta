import { expect, it } from 'vitest';
import { showExternalNames } from '../../../../../src/infrastructure/sources/workbook/external-names.js';
import { growthOf } from '../../../../support/stopwatch.js';

// RF-151, ADR-013, Q-38: a formula is untrusted text with no length cap in the file, so the rewrite of
// its external paths must stay linear. Each shape below is built with a count n at n/4 and at n and
// must grow about linearly: a quadratic reader grows about sixteen times on four times the input. The
// largest inputs are a few hundred thousand characters, which the file itself does not cap.

const LINKS = ['C:\\Users\\x\\Rates.xlsx'];
/** Linear work takes about 4 times as long on 4 times the input; quadratic work about 16 times. */
const maxGrowth = 8;

/** The time on the formula built from the large count over the time on the one built from a quarter of it. */
function growthOfFormula(build: (count: number) => string, largeCount: number) {
  return growthOf(
    (formula) => showExternalNames(formula, LINKS),
    build(largeCount / 4),
    build(largeCount),
  );
}

it.each([
  ['an unclosed quote and UNC starts', (n: number) => `'${'\\\\'.repeat(n)}`, 150_000],
  ['an unclosed quote and drive starts', (n: number) => `'${'C:/'.repeat(n)}`, 100_000],
  ['an unclosed quote and URL starts', (n: number) => `'${'http://'.repeat(n)}`, 42_000],
  ['an unclosed quote and bracket paths', (n: number) => `'${'C:/x/[R.xlsx]'.repeat(n)}`, 40_000],
  ['a word of backslashes and drive starts', (n: number) => 'C:\\'.repeat(n), 100_000],
  ['an unclosed quote and nested brackets', (n: number) => `'${'['.repeat(n)}]`, 600_000],
  [
    'an unclosed quote and nested brackets with text',
    (n: number) => `'${'[a'.repeat(n)}]`,
    300_000,
  ],
  [
    'an unclosed quote, nested brackets and a path',
    (n: number) => `'${'[a'.repeat(n)}C:\\x\\R.xlsx]`,
    100_000,
  ],
  [
    'words that straddle every chunk boundary',
    (n: number) => `+${'W'.repeat(32_767)}`.repeat(n),
    36,
  ],
  [
    'quoted names that straddle every chunk boundary',
    (n: number) => `'${'a'.repeat(20_000)}'!A1+`.repeat(n),
    60,
  ],
  [
    'brackets that straddle every chunk boundary',
    (n: number) => `+[${'b'.repeat(30_000)}]`.repeat(n),
    40,
  ],
])('RF-151 rewrites a formula of %s in linear time', (_name, build, largeCount) => {
  const growth = growthOfFormula(build, largeCount);

  expect(growth.ratio).toBeLessThan(maxGrowth);
});

it('RF-151 hides a path inside a very long quoted name without reading the name twice', () => {
  const name = (n: number) => `'C:\\Users\\x\\[Rates.xlsx]${'a'.repeat(n)}'!A1`;
  const growth = growthOfFormula(name, 300_000);

  expect(showExternalNames(name(300_000), LINKS)).toBe(`'[Rates.xlsx]${'a'.repeat(300_000)}'!A1`);
  expect(growth.ratio).toBeLessThan(maxGrowth);
});

it('RF-151 looks back before 25,000 table references once over the whole formula', () => {
  const formula = (n: number) =>
    `C:\\Users\\john-doe\\[Rates.xlsx]S!A1+${'Table1[Col]+'.repeat(n)}A1`;
  const growth = growthOfFormula(formula, 25_000);

  expect(
    showExternalNames(formula(25_000), LINKS).startsWith('[Rates.xlsx]S!A1+Table1[Col]+'),
  ).toBe(true);
  expect(growth.ratio).toBeLessThan(maxGrowth);
});
