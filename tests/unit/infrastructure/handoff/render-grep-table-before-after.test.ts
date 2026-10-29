import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { grepCases } from '../../../support/grep-table-matrix.js';

// RF-640, P6-28, DEC-190: moving the patterns and aliases to the catalogue must not change the grep
// table of a stack made only of known languages. The one agreed addition is the row marked "checked
// by reading" (and the sentence that explains it), which is taken out before the comparison.

const before = JSON.parse(
  await readFile('tests/fixtures/handoff/grep-table-before.json', 'utf8'),
) as Record<string, string>;

const readingRow = '| checked by reading |';
const readingSentence = 'A row whose pattern cell reads "checked by reading"';

const NL = String.fromCharCode(10);

function withoutAdditions(section: string): string {
  const lines = section.split(NL);
  const kept = lines.filter(
    (line, at) =>
      !line.startsWith(readingRow) &&
      !line.startsWith(readingSentence) &&
      !(line === '' && lines[at - 1]?.startsWith(readingSentence) === true),
  );
  return kept.join(NL);
}

describe('the grep table before and after the catalogue file', () => {
  const after = grepCases();

  it('RF-640 P6-28 covers every stack, principle set and risk class of the grid', () => {
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(Object.keys(before)).toHaveLength(192);
  });

  it.each(Object.keys(before))(
    'RF-640 P6-28 %s reads as before apart from the additions',
    (key) => {
      const expected = before[key];
      const actual = withoutAdditions(after[key] ?? '');

      // A section that held only reading rows has no table left; it then reads as the old one-line
      // statement or an empty table, which the next test covers.
      expect(actual).toBe(expected);
    },
  );
});
