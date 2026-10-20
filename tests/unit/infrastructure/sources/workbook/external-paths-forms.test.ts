import { expect, it } from 'vitest';
import { showExternalNames } from '../../../../../src/infrastructure/sources/workbook/external-names.js';
import { extractReferences } from '../../../../../src/infrastructure/sources/workbook/formula-references.js';
import { book, cell, fileOf, num, sheet } from '../../../../support/rendered-workbook-fixtures.js';
import { projectOf, sectionOf, withFormula } from '../../../../support/dependency-fixtures.js';

// Q-38, RF-153: no local folder, user name, URL path or UNC share reaches a rendered file, whatever
// characters the folder holds. A folder may hold any character Windows allows in a name (`-`, `(`,
// `)`, `&`, space, `'`, `#`, `$`, `@`, `!`, `,`, `;`, `=`, `+`, `~`, letters beyond ASCII), and a
// path may be written without quotes, after an operator or a string, without a bracket (Excel's
// display form of an external name) or longer than 1,000 characters. A structured table reference
// and a division by a stored link are not paths and stay as they are.

const FOLDER_FORMS = [
  String.raw`C:\Users\john-doe\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Docs(2)\[Rates.xlsx]Rates!C5`,
  String.raw`C:\R&D\[Rates.xlsx]Rates!C5`,
  String.raw`\\srv\my-share\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john doe\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john's\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john#1\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john$\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john!\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john,doe\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john;doe\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john=doe\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john+doe\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john~1\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john@doe\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\jöhn\[Rates.xlsx]Rates!C5`,
  String.raw`C:\Users\john[1]\[Rates.xlsx]Rates!C5`,
  String.raw`1+C:\Users\john-doe\[Rates.xlsx]Rates!C5`,
  String.raw`"x"&C:\Users\john-doe\[Rates.xlsx]Rates!C5`,
] as const;

const FOLDER_TEXT = /Users|srv|my-share|Docs|R&D|john|jöhn/u;

function renderedBook(formulas: readonly string[], refersTo = 'S!$B$1') {
  const cells = formulas.map((text, i) => withFormula(`A${String(i + 1)}`, text));
  const reader = book([sheet('S', { cells: [cell('B1', num(1)), ...cells] })], {
    fileName: 'Reader.xlsx',
    externalLinks: [{ fileName: String.raw`C:\Users\x\Rates.xlsx` }],
    definedNames: [{ name: 'Rate', hidden: false, refersTo }],
  });
  const rates = book([sheet('Rates', { cells: [cell('C5', num(1))] })], {
    fileName: 'Rates.xlsx',
    definedNames: [{ name: 'TaxRate', hidden: false, refersTo: 'Rates!$C$5' }],
  });
  const project = projectOf([reader, rates]);
  const [first] = project.workbooks;
  if (first === undefined) throw new Error('No workbook rendered');
  return {
    formulas: fileOf(first, 'S/formulas.md'),
    index: fileOf(first, 'workbook.md'),
    map: project.dependencies.content,
  };
}

it.each(FOLDER_FORMS)(
  'Q-38 hides the folder of the unquoted path %s in every rendered file',
  (form) => {
    const inCell = renderedBook([form]);
    const inName = renderedBook([], form);

    for (const text of [inCell.formulas, inCell.map, inName.index, inName.map]) {
      expect(text).not.toMatch(FOLDER_TEXT);
    }
    expect(inCell.formulas).toContain('[Rates.xlsx]Rates!C5');
    expect(inName.index).toContain('[Rates.xlsx]Rates!C5');
  },
);

it('Q-38 resolves an unquoted path whose folder holds a dash to the uploaded workbook', () => {
  const { map } = renderedBook([String.raw`C:\Users\john-doe\[Rates.xlsx]Rates!C5*2`]);

  expect(sectionOf(map, 'Workbooks')).toEqual(['Reader.xlsx -> Rates.xlsx: 1 formula']);
  expect(sectionOf(map, 'Unresolved and dynamic references')).toEqual(['None.']);
});

it('RF-153 resolves the bracket-path form of a cell formula to the uploaded workbook, folder dropped', () => {
  const { map, formulas } = renderedBook([String.raw`[C:\Users\x\Rates.xlsx]Rates!C5*2`]);

  expect(sectionOf(map, 'Workbooks')).toEqual(['Reader.xlsx -> Rates.xlsx: 1 formula']);
  expect(sectionOf(map, 'Sheets')).toEqual(['Reader.xlsx/S -> Rates.xlsx/Rates: 1 formula']);
  expect(sectionOf(map, 'Unresolved and dynamic references')).toEqual(['None.']);
  expect(map).not.toContain('Users');
  expect(formulas).toContain('A1 = [Rates.xlsx]Rates!C5*2');
});

it('RF-153 reads the bracket-path form as a reference to the file, not to the path', () => {
  const { references } = extractReferences(String.raw`[C:\Users\x\Rates.xlsx]Rates!C5`);

  expect(references).toEqual([
    expect.objectContaining({
      kind: 'range',
      scope: { book: { name: 'Rates.xlsx' }, first: 'Rates' },
    }),
  ]);
});

const NO_BRACKET = [
  String.raw`'C:\Users\john-doe\Rates.xlsx'!TaxRate`,
  String.raw`'\\srv\my-share\Rates.xlsx'!TaxRate`,
  `'https://srv.example/Users/john/Rates.xlsx'!TaxRate`,
] as const;

it.each(NO_BRACKET)('Q-38 hides the folder of the display form %s of an external name', (form) => {
  const inCell = renderedBook([`${form}*2`]);
  const inName = renderedBook([], form);

  for (const text of [inCell.formulas, inCell.map, inName.index, inName.map]) {
    expect(text).not.toMatch(FOLDER_TEXT);
    expect(text).not.toContain('srv.example');
  }
  expect(inCell.formulas).toContain("A1 = '[Rates.xlsx]'!TaxRate*2");
  expect(sectionOf(inCell.map, 'Workbooks')).toEqual(['Reader.xlsx -> Rates.xlsx: 1 formula']);
});

it('Q-38 hides the folder before a bracket that no sheet follows, and one the bracket opens with', () => {
  const links = [String.raw`C:\Users\x\Rates.xlsx`];

  expect(showExternalNames(String.raw`1+C:\Users\john-doe\[Rates.xlsx]`, links)).toBe(
    '1+[Rates.xlsx]',
  );
  expect(showExternalNames(String.raw`1+[C:\Users\john-doe\Rates.xlsx]`, links)).toBe(
    '1+[Rates.xlsx]',
  );
});

it('Q-38 keeps a quoted sheet name and a three-dimensional span that hold no separator', () => {
  const links = [String.raw`C:\Users\x\Rates.xlsx`];

  expect(showExternalNames("'Rates 2026'!A1+'S 1:S 3'!B2", links)).toBe(
    "'Rates 2026'!A1+'S 1:S 3'!B2",
  );
});

it('Q-38 hides the folder of an unquoted path longer than 1,000 characters', () => {
  const folder = `C:\\${'john-doe\\'.repeat(140)}`;
  const { formulas, map } = renderedBook([`${folder}[Rates.xlsx]Rates!C5`]);

  expect(folder.length).toBeGreaterThan(1000);
  expect(formulas).toContain('A1 = [Rates.xlsx]Rates!C5');
  expect(formulas).not.toContain('john');
  expect(map).not.toContain('john');
});

const LINKS = [String.raw`C:\Users\x\Rates.xlsx`, 'Other.xlsx'];

it.each([
  'Table1[Col]',
  'Table1[[#This Row],[Rate-1]]',
  "Table1[Rate'#]",
  'A1/[2]S!B1',
  'SUM(Table1[Col],A1/[2]S!B1)',
])('Q-38 leaves the table reference or division %s whole, with the link resolved', (formula) => {
  const expected = formula.replace('[2]', '[Other.xlsx]');

  expect(showExternalNames(formula, LINKS)).toBe(expected);
});

it('RF-153 still reads a table reference by its table name when the folder rule applies', () => {
  const { references } = extractReferences(
    "Table1[Col]+Table1[[#This Row],[Rate-1]]+Table1[Rate'#]",
  );

  expect(references).toEqual([
    { kind: 'table', table: 'Table1', spec: '[Col]' },
    { kind: 'table', table: 'Table1', spec: '[[#This Row],[Rate-1]]' },
    { kind: 'table', table: 'Table1', spec: "[Rate'#]" },
  ]);
});
