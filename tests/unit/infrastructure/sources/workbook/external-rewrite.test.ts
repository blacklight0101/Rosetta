import { expect, it } from 'vitest';
import { showExternalNames } from '../../../../../src/infrastructure/sources/workbook/external-names.js';
import { book, cell, fileOf, num, sheet } from '../../../../support/rendered-workbook-fixtures.js';
import { projectOf, sectionOf } from '../../../../support/dependency-fixtures.js';

// Q-38, RF-153: the rewrite of the workbook part of an external reference uses the tokenizer, so it
// changes only that part. Sheet names, table specifiers, strings and operators are copied as they
// are, and no folder is left.

const LINKS = [String.raw`C:\Users\x\Rates.xlsx`, 'Other.xlsx'];
const rewrite = (formula: string): string => showExternalNames(formula, LINKS);

it.each([
  ["SUM(Table1[Price])*'Rates 2026'!$C$4", "SUM(Table1[Price])*'Rates 2026'!$C$4"],
  ["[1]Rates!C4+'Rates 2026'!A1", "[Rates.xlsx]Rates!C4+'Rates 2026'!A1"],
  ["'It''s'!A1+Table1[x]", "'It''s'!A1+Table1[x]"],
  [
    String.raw`Table1[Rate'#]+'C:\Users\x\[Rates.xlsx]Rates'!C12`,
    "Table1[Rate'#]+'[Rates.xlsx]Rates'!C12",
  ],
  ["Table1[[#This Row],[A'[b']]]+'a b'!C1", "Table1[[#This Row],[A'[b']]]+'a b'!C1"],
  ["'a[b'!A1", "'a[b'!A1"],
  ["'a[b]c'!A1", "'a[b]c'!A1"],
  ['Table1[x]+[1]Rates!A1+Table1[y]', 'Table1[x]+[Rates.xlsx]Rates!A1+Table1[y]'],
  ["\"[1]Sheet!A1'\"&'Rates 2026'!B2", "\"[1]Sheet!A1'\"&'Rates 2026'!B2"],
  ['A1/[2]S!B1', 'A1/[Other.xlsx]S!B1'],
])('Q-38 rewrites %s to %s', (formula, expected) => {
  expect(rewrite(formula)).toBe(expected);
});

it('Q-38 hides the folder of a bracket path longer than 300 and than 1,000 characters', () => {
  for (const depth of [200, 600]) {
    const folder = 'C:\\' + 'd\\'.repeat(depth);
    expect(rewrite(`[${folder}Rates.xlsx]Rates!C5+1`)).toBe('[Rates.xlsx]Rates!C5+1');
    expect(rewrite(`'${folder}[Rates.xlsx]Rates'!C5+1`)).toBe("'[Rates.xlsx]Rates'!C5+1");
  }
});

it('Q-38 hides the folder of a bare URL, a UNC path and a drive path written without quotes', () => {
  expect(rewrite('https://srvhost/Users/x/[Rates.xlsx]Rates!$A$1')).toBe('[Rates.xlsx]Rates!$A$1');
  expect(rewrite(String.raw`SUM(\\srvhost\share\[Rates.xlsx]S!A1)`)).toBe('SUM([Rates.xlsx]S!A1)');
  expect(rewrite(String.raw`1+C:\Users\x\[Rates.xlsx]S!A1`)).toBe('1+[Rates.xlsx]S!A1');
});

it('Q-38 hides the folder after the tokenizer stops: a very long formula and one with too many references', () => {
  const long = `${'1+'.repeat(20_000)}'C:\\Users\\x\\[Rates.xlsx]Rates'!C5`;
  expect(rewrite(long)).not.toContain('Users');
  const many = `${'A1+'.repeat(5000)}'C:\\Users\\x\\[Rates.xlsx]Rates'!C5`;
  expect(rewrite(many)).not.toContain('Users');
});

it('Q-38 hides the folder of a quote that is never closed', () => {
  expect(rewrite(String.raw`1+'C:\Users\x\[R.xlsx]S`)).toBe("1+'[R.xlsx]S");
  expect(rewrite(String.raw`'C:\Users\x\[R.xlsx]S!A1+2`)).toBe("'[R.xlsx]S!A1+2");
});

it.each([32_000, 32_767, 32_768, 33_000, 70_000])(
  'Q-38 hides the folder after a string literal of %i characters',
  (length) => {
    const literal = `"${'x'.repeat(length)}"&`;
    const quoted = rewrite(literal + String.raw`'C:\Users\x\[Rates.xlsx]Rates'!C5`);
    const bracket = rewrite(literal + String.raw`[C:\Users\x\Rates.xlsx]Rates!C5`);
    const linked = rewrite(`${literal}[1]Rates!C5+""""&[2]S!A1`);

    expect(quoted).toBe(`${literal}'[Rates.xlsx]Rates'!C5`);
    expect(bracket).toBe(`${literal}[Rates.xlsx]Rates!C5`);
    expect(linked).toBe(`${literal}[Rates.xlsx]Rates!C5+""""&[Other.xlsx]S!A1`);
  },
);

it('Q-38 reads a doubled quote inside a very long literal as part of it', () => {
  const literal = `"${'x'.repeat(40_000)}""y${'x'.repeat(10)}"&`;

  expect(rewrite(literal + String.raw`[C:\Users\x\Rates.xlsx]S!A1`)).toBe(
    `${literal}[Rates.xlsx]S!A1`,
  );
});

const PATH_AFTER = String.raw`&'C:\Users\x\[Rates.xlsx]Rates'!C5`;

it.each(['', '1+'])(
  'Q-38 hides the folder of a name or a word longer than a chunk, after %j',
  (lead) => {
    const name = `'${'a'.repeat(33_000)}'`;
    const doubled = `'${"a''".repeat(12_000)}'`;

    const inside = rewrite(`${lead}'C:\\Users\\x\\[Rates.xlsx]${'a'.repeat(33_000)}'!A1`);

    expect(inside).toBe(`${lead}'[Rates.xlsx]${'a'.repeat(33_000)}'!A1`);
    expect(rewrite(lead + name + PATH_AFTER)).toBe(`${lead}${name}&'[Rates.xlsx]Rates'!C5`);
    expect(rewrite(lead + doubled + PATH_AFTER)).toBe(`${lead}${doubled}&'[Rates.xlsx]Rates'!C5`);
    expect(rewrite(lead + 'A'.repeat(40_000) + PATH_AFTER)).toBe(
      `${lead}${'A'.repeat(40_000)}&'[Rates.xlsx]Rates'!C5`,
    );
  },
);

// A seeded generator: formulas made of pieces whose rewrite is known, joined by operators.

interface Piece {
  readonly input: string;
  readonly output: string;
}

const same = (text: string): Piece => ({ input: text, output: text });
const PIECES: readonly Piece[] = [
  same('A1'),
  same('$B$2:C9'),
  same('Table1[Price]'),
  same("Table1[Rate'#]"),
  same("Table1[[#This Row],[Col'[x']]]"),
  same("T[[A]:[B']]]"),
  same('[@Qty]'),
  same(`"${'x'.repeat(33_000)}"`),
  same("'Rates 2026'!$C$4"),
  same("'It''s'!B2"),
  same("'a b'!A1:B2"),
  same("'a[b'!A1"),
  same('"say [1] and \'x\' ""y"""'),
  same('"C:\\Users\\x\\[Z.xlsx]"'),
  { input: String.raw`'C:\Users\x\[Rates.xlsx]Rates'!C5`, output: "'[Rates.xlsx]Rates'!C5" },
  { input: String.raw`'\\srvhost\share\Users\[Rates.xlsx]S'!A1`, output: "'[Rates.xlsx]S'!A1" },
  { input: "'https://srvhost/Users/[Rates.xlsx]S'!A1", output: "'[Rates.xlsx]S'!A1" },
  { input: String.raw`[C:\Users\x\Rates.xlsx]Rates!C5`, output: '[Rates.xlsx]Rates!C5' },
  { input: '[1]Rates!C4', output: '[Rates.xlsx]Rates!C4' },
  { input: "'[1]My Sheet'!B2", output: "'[Rates.xlsx]My Sheet'!B2" },
  { input: '[2]!TaxRate', output: '[Other.xlsx]!TaxRate' },
  { input: 'https://srvhost/Users/x/[Rates.xlsx]Rates!$A$1', output: '[Rates.xlsx]Rates!$A$1' },
];
const UNCLOSED: Piece = { input: String.raw`&'C:\Users\x\[R.xlsx]S`, output: "&'[R.xlsx]S" };
const JOINERS = ['+', '*', '&', ',', '-', '>'] as const;

function generated(seed: number): Piece {
  let state = seed;
  const next = (limit: number): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return Math.floor(state / 65_536) % limit;
  };
  const parts: Piece[] = [];
  for (let i = 0, count = 2 + next(5); i < count; i += 1) {
    parts.push(PIECES[next(PIECES.length)] ?? same('A1'));
  }
  const joiners = parts.map(() => JOINERS[next(JOINERS.length)] ?? '+');
  const join = (pick: (piece: Piece) => string): string =>
    parts.map((piece, i) => `${i === 0 ? '' : (joiners[i] ?? '+')}${pick(piece)}`).join('');
  const tail = next(5) === 0 ? UNCLOSED : same('');
  return {
    input: `SUM(${join((p) => p.input)})${tail.input}`,
    output: `SUM(${join((p) => p.output)})${tail.output}`,
  };
}

it('Q-38 changes only the workbook part of external references in 500 generated formulas', () => {
  const wrong: { input: string; result: string; output: string }[] = [];
  const leaks: string[] = [];
  for (let seed = 1; seed <= 500; seed += 1) {
    const { input, output } = generated(seed * 7919);
    const result = rewrite(input);
    if (result !== output) wrong.push({ input, result, output });
    const visible = result.replaceAll(String.raw`"C:\Users\x\[Z.xlsx]"`, '');
    if (/Users|srvhost|host\.example/u.test(visible)) leaks.push(result);
  }
  expect(wrong).toEqual([]);
  expect(leaks).toEqual([]);
});

it('Q-38 keeps a quoted sheet name in a defined name written to workbook.md and dependencies.md', () => {
  const refersTo = "SUM(Table1[Price])*'Rates 2026'!$C$4";
  const model = book([sheet('Rates 2026', { cells: [cell('C4', num(1))] })], {
    fileName: 'Book.xlsx',
    definedNames: [{ name: 'Total', hidden: false, refersTo }],
  });
  const project = projectOf([model]);
  const [first] = project.workbooks;
  if (first === undefined) throw new Error('No workbook rendered');
  expect(fileOf(first, 'workbook.md')).toContain(refersTo);
  expect(sectionOf(project.dependencies.content, 'Defined names')[0]).toContain(
    `refers to "${refersTo}"`,
  );
});

it('Q-38 hides the folder of a defined name that is a bare URL, in workbook.md and dependencies.md', () => {
  const model = book([sheet('S')], {
    fileName: 'Book.xlsx',
    definedNames: [
      { name: 'Remote', hidden: false, refersTo: 'https://srvhost/Users/x/[Rates.xlsx]Rates!$A$1' },
    ],
  });
  const project = projectOf([model]);
  const [first] = project.workbooks;
  if (first === undefined) throw new Error('No workbook rendered');
  for (const text of [fileOf(first, 'workbook.md'), project.dependencies.content]) {
    expect(text).not.toContain('srvhost');
    expect(text).toContain('[Rates.xlsx]Rates!$A$1');
  }
});
