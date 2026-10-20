import { expect, it } from 'vitest';
import { book, cell, fileOf, num, sheet } from '../../../../support/rendered-workbook-fixtures.js';
import { projectOf, sectionOf, withFormula } from '../../../../support/dependency-fixtures.js';

// Q-38, RF-153: the folder of another workbook often holds a user name. Wherever the text of a
// formula or a name is written, the workbook part of a reference is only the file name, in the stored
// form (`[1]`), the path form with the folder before the bracket, the folder inside the bracket, a UNC
// path or a URL.

const FORMS = [
  String.raw`'C:\Users\x\[Rates.xlsx]Rates'!C5`,
  String.raw`'\\server\share\Users\x\[Rates.xlsx]Rates'!C5`,
  `'https://host.example/Users/x/[Rates.xlsx]Rates'!C5`,
  `'file:///C:/Users/x/[Rates.xlsx]Rates'!C5`,
  String.raw`[C:\Users\x\Rates.xlsx]Rates!C5`,
  `'/home/Users/x/[Rates.xlsx]Rates'!C5`,
] as const;

const BARE = ["'[Rates.xlsx]Rates'!C5", '[Rates.xlsx]Rates!C5'];

function renderedBook(formulas: readonly string[], refersTo = 'Rates!$C$4') {
  const cells = formulas.map((text, i) => withFormula(`A${String(i + 1)}`, text));
  const model = book([sheet('S', { cells: [cell('B1', num(1)), ...cells] })], {
    fileName: 'Reader.xlsx',
    externalLinks: [{ fileName: String.raw`C:\Users\x\Rates.xlsx` }],
    definedNames: [{ name: 'Rate', hidden: false, refersTo }],
  });
  const rates = book([sheet('Rates', { cells: [cell('C5', num(1))] })], { fileName: 'Rates.xlsx' });
  return projectOf([model, rates]);
}

it.each(FORMS)('Q-38 writes %s in formulas.md with the file name only', (form) => {
  const project = renderedBook([`${form}*2`]);
  const [reader] = project.workbooks;
  if (reader === undefined) throw new Error('No workbook rendered');
  const formulas = fileOf(reader, 'S/formulas.md');
  expect(formulas).not.toContain('Users');
  expect(formulas).not.toContain('server');
  expect(formulas).not.toContain('host.example');
  expect(BARE.some((bare) => formulas.includes(`A1 = ${bare}*2`))).toBe(true);
});

it.each(FORMS)('Q-38 writes %s in a defined name with the file name only', (form) => {
  const project = renderedBook([], form);
  const [reader] = project.workbooks;
  if (reader === undefined) throw new Error('No workbook rendered');
  const texts = [project.dependencies.content, fileOf(reader, 'workbook.md')];
  for (const text of texts) {
    expect(text).not.toContain('Users');
    expect(text).not.toContain('server');
    expect(text).not.toContain('host.example');
    expect(BARE.some((bare) => text.includes(bare))).toBe(true);
  }
});

it('Q-38 writes the link number of a defined name as the file name, in both files', () => {
  const project = renderedBook([], '[1]Rates!$C$4');
  const [reader] = project.workbooks;
  if (reader === undefined) throw new Error('No workbook rendered');
  expect(sectionOf(project.dependencies.content, 'Defined names')[0]).toContain(
    'refers to "[Rates.xlsx]Rates!$C$4"',
  );
  expect(fileOf(reader, 'workbook.md')).toContain('[Rates.xlsx]Rates!$C$4');
  expect(fileOf(reader, 'workbook.md')).not.toContain('[1]Rates');
});

it('Q-38 writes the same in the formulas of a validation rule and of a conditional rule', () => {
  const model = book(
    [
      sheet('S', {
        validations: [
          {
            ranges: 'A1',
            type: 'list',
            formula1: String.raw`'C:\Users\x\[Rates.xlsx]Rates'!$A$1:$A$3`,
          },
        ],
        conditionalRules: [
          { ranges: 'B1', type: 'expression', formulas: [String.raw`[1]Rates!C5>1`] },
        ],
      }),
    ],
    { externalLinks: [{ fileName: String.raw`C:\Users\x\Rates.xlsx` }] },
  );
  const [reader] = projectOf([model]).workbooks;
  if (reader === undefined) throw new Error('No workbook rendered');
  const validation = fileOf(reader, 'S/validation.md');
  expect(validation).not.toContain('Users');
  expect(validation).toContain("'[Rates.xlsx]Rates'!$A$1:$A$3");
  expect(validation).toContain('[Rates.xlsx]Rates!C5>1');
});

it('Q-38 leaves a path inside a string literal and a structured reference alone', () => {
  const project = renderedBook([String.raw`"C:\Users\x\[1]"&Table1[[#This Row],[1]]`]);
  const [reader] = project.workbooks;
  if (reader === undefined) throw new Error('No workbook rendered');
  const formulas = fileOf(reader, 'S/formulas.md');
  expect(formulas).toContain(String.raw`"C:\Users\x\[1]"&Table1[[#This Row],[1]]`);
});
