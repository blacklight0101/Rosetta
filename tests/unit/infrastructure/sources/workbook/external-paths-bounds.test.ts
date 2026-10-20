import { expect, it } from 'vitest';
import { showExternalNames } from '../../../../../src/infrastructure/sources/workbook/external-names.js';

// RF-151, ADR-013, Q-38: a formula is untrusted text with no length cap in the file, so the rewrite of
// its external paths must stay linear. Each input below took 20 to 69 seconds (the loose pass) or
// several seconds (the look-back) when the work grew with the square of the length; linear, each
// takes well under 100 ms. The bounds are more than ten times the linear time and far below the
// quadratic one, so the tests hold under load without being timing-sensitive.

const LINKS = ['C:\\Users\\x\\Rates.xlsx'];
const LIMIT_MS = 2000;

function timed(formula: string): { out: string; ms: number } {
  const started = performance.now();
  const out = showExternalNames(formula, LINKS);
  return { out, ms: performance.now() - started };
}

it.each([
  ['an unclosed quote and 150,000 UNC starts', `'${'\\\\'.repeat(150_000)}`],
  ['an unclosed quote and 100,000 drive starts', `'${'C:/'.repeat(100_000)}`],
  ['an unclosed quote and 42,000 URL starts', `'${'http://'.repeat(42_000)}`],
  ['an unclosed quote and 40,000 bracket paths', `'${'C:/x/[R.xlsx]'.repeat(40_000)}`],
  ['a word of 300,000 backslashes and drive starts', 'C:\\'.repeat(100_000)],
  ['an unclosed quote, 600,000 nested brackets and one close', `'${'['.repeat(600_000)}]`],
  [
    'an unclosed quote, 300,000 nested brackets with text and one close',
    `'${'[a'.repeat(300_000)}]`,
  ],
  [
    'an unclosed quote, 100,000 nested brackets, a path and one close',
    `'${'[a'.repeat(100_000)}C:\\x\\R.xlsx]`,
  ],
  ['words that straddle every chunk boundary', `+${'W'.repeat(32_767)}`.repeat(9)],
  ['quoted names that straddle every chunk boundary', `'${'a'.repeat(20_000)}'!A1+`.repeat(15)],
  ['brackets that straddle every chunk boundary', `+[${'b'.repeat(30_000)}]`.repeat(10)],
])('RF-151 rewrites a formula of %s in bounded time', (_name, formula) => {
  const { ms } = timed(formula);

  expect(ms).toBeLessThan(LIMIT_MS);
});

it('RF-151 hides a path inside a very long quoted name without reading the name twice', () => {
  const name = `'C:\\Users\\x\\[Rates.xlsx]${'a'.repeat(300_000)}'!A1`;

  const { out, ms } = timed(name);

  expect(out).toBe(`'[Rates.xlsx]${'a'.repeat(300_000)}'!A1`);
  expect(ms).toBeLessThan(LIMIT_MS);
});

it('RF-151 looks back before 25,000 table references once over the whole formula', () => {
  const formula = `C:\\Users\\john-doe\\[Rates.xlsx]S!A1+${'Table1[Col]+'.repeat(25_000)}A1`;

  const { out, ms } = timed(formula);

  expect(out.startsWith('[Rates.xlsx]S!A1+Table1[Col]+')).toBe(true);
  expect(ms).toBeLessThan(LIMIT_MS);
});
