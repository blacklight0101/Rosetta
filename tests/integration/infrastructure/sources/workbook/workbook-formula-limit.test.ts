import { describe, expect, it } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  formulaCell,
  numberCell,
  readBuilt,
  row,
  worksheet,
} from '../../../../support/workbook-fixtures.js';

// RF-151, DEC-152, P3-56: a formula is at most 8,192 characters, counted as Excel does (UTF-16 code
// units after the XML is unescaped), wherever the reader takes a formula from: cells (plain, shared
// and array), defined names, data validation and conditional formatting.

const root = useWritableTempRoot('rosetta-workbook-formula-');
const LIMIT = 8192;

type Site = (formula: string) => Promise<Buffer>;

const cellSheet = (cell: string, after = ''): Promise<Buffer> =>
  buildWorkbook({
    sheets: [{ name: 'Sheet One', xml: worksheet(row(1, `${numberCell('A1', 1)}${cell}`), after) }],
  });

const cellSite: Site = (f) => cellSheet(formulaCell('B1', f));

const SITES: readonly (readonly [string, Site, string])[] = [
  ['a cell formula', cellSite, 'cell B1'],
  [
    'a shared formula',
    (f) => cellSheet(`<c r="B1"><f t="shared" ref="B1:B2" si="0">${f}</f></c>`),
    'cell B1',
  ],
  ['an array formula', (f) => cellSheet(`<c r="B1"><f t="array" ref="B1">${f}</f></c>`), 'cell B1'],
  [
    'a defined name',
    (f) =>
      buildWorkbook({
        sheets: [{ name: 'Sheet One' }],
        workbookExtra: `<definedNames><definedName name="BigName">${f}</definedName></definedNames>`,
      }),
    'defined name "BigName"',
  ],
  [
    'a validation rule',
    (f) =>
      cellSheet(
        '',
        `<dataValidations count="1"><dataValidation type="custom" sqref="C3"><formula1>${f}</formula1></dataValidation></dataValidations>`,
      ),
    'data validation rule on "C3"',
  ],
  [
    'the second formula of a validation rule',
    (f) =>
      cellSheet(
        '',
        `<dataValidations count="1"><dataValidation type="whole" operator="between" sqref="C3"><formula1>1</formula1><formula2>${f}</formula2></dataValidation></dataValidations>`,
      ),
    'data validation rule on "C3"',
  ],
  [
    'a conditional-formatting rule',
    (f) =>
      cellSheet(
        '',
        `<conditionalFormatting sqref="D4"><cfRule type="expression" priority="1"><formula>${f}</formula></cfRule></conditionalFormatting>`,
      ),
    'conditional-formatting rule on "D4"',
  ],
];

async function failureOf(bytes: Buffer): Promise<RosettaError> {
  try {
    await readBuilt(root.path, bytes, { fileName: 'Big Book.xlsx' });
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('expected the workbook to be refused');
}

describe('RF-151 the formula length limit', () => {
  it.each(SITES)('RF-151 accepts %s of exactly 8,192 characters', async (_what, site) => {
    const model = await readBuilt(root.path, await site('1'.repeat(LIMIT)));

    expect(model.sheets).toHaveLength(1);
  });

  it.each(SITES)(
    'RF-151 refuses %s of 8,193 characters with RST-1931 naming the workbook, the sheet and the place',
    async (_what, site, place) => {
      const error = await failureOf(await site('1'.repeat(LIMIT + 1)));

      expect(error.code).toBe('RST-1931');
      expect(error.message).toContain('"Big Book.xlsx"');
      expect(error.message).toContain(place);
      expect(error.message).toContain('Excel cannot write such a formula');
    },
  );

  it('RF-151 names the sheet of a cell in the refusal', async () => {
    const error = await failureOf(await cellSite('1'.repeat(LIMIT + 1)));

    expect(error.message).toContain('sheet "Sheet One"');
  });
});

describe('RF-151 the formula length is counted after unescaping, in UTF-16 code units', () => {
  it.each(SITES)(
    'RF-151 accepts %s whose escaped XML is 32,768 characters but whose text is 8,192',
    async (_what, site) => {
      const model = await readBuilt(root.path, await site('&lt;'.repeat(LIMIT)));

      expect(model.sheets).toHaveLength(1);
    },
  );

  it('RF-151 refuses an escaped formula of 8,193 characters once unescaped', async () => {
    const error = await failureOf(await cellSite(`${'&amp;'.repeat(LIMIT)}&gt;`));

    expect(error.code).toBe('RST-1931');
  });

  it('RF-151 accepts 4,096 non-BMP characters (8,192 code units)', async () => {
    const model = await readBuilt(root.path, await cellSite('&#x1F600;'.repeat(LIMIT / 2)));

    expect(model.sheets[0]?.cells[1]?.formula?.text.length).toBe(LIMIT);
  });

  it('RF-151 counts a non-BMP character as two: 8,191 characters and one emoji are refused', async () => {
    const error = await failureOf(await cellSite(`${'1'.repeat(LIMIT - 1)}&#x1F600;`));

    expect(error.code).toBe('RST-1931');
  });

  it('RF-151 counts the characters of a formula that streams in pieces, CDATA included', async () => {
    const half = '1'.repeat(LIMIT / 2);
    const cell = `<c r="B1"><f>${half}<![CDATA[${half}1]]></f></c>`;

    expect((await failureOf(await cellSheet(cell))).code).toBe('RST-1931');
  });
});
