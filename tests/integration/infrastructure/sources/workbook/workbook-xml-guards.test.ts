import { expect, it } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  numberCell,
  readBuilt,
  row,
  sharedCell,
  worksheet,
  type WorkbookSpec,
} from '../../../../support/workbook-fixtures.js';

const root = useWritableTempRoot('rosetta-workbook-xml-');

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

async function codeOf(spec: WorkbookSpec): Promise<string | undefined> {
  try {
    await readBuilt(root.path, await buildWorkbook(spec));
    return undefined;
  } catch (error) {
    return error instanceof RosettaError ? error.code : String(error);
  }
}

const SHEET_ONE = [{ name: 'S', xml: worksheet(row(1, sharedCell('A1', 0))) }];

it('RF-151 refuses a document type found in sharedStrings.xml alone with RST-1923', async () => {
  const spec = {
    sheets: SHEET_ONE,
    rawSharedStrings: `<!DOCTYPE sst><sst xmlns="${MAIN_NS}"><si><t>x</t></si></sst>`,
  };

  expect(await codeOf(spec)).toBe('RST-1923');
});

it('RF-151 names the part that held the document type', async () => {
  const bytes = await buildWorkbook({
    sheets: SHEET_ONE,
    rawSharedStrings: `<!DOCTYPE sst><sst xmlns="${MAIN_NS}"><si><t>x</t></si></sst>`,
  });

  await expect(readBuilt(root.path, bytes)).rejects.toThrow(/xl\/sharedStrings\.xml/);
});

it('RF-151 refuses an internal entity that is declared and used once with RST-1923', async () => {
  const spec = {
    sheets: SHEET_ONE,
    rawSharedStrings: `<!DOCTYPE sst [<!ENTITY e "expanded">]><sst xmlns="${MAIN_NS}"><si><t>&e;</t></si></sst>`,
  };

  expect(await codeOf(spec)).toBe('RST-1923');
});

it('RF-151 refuses an external entity declaration without fetching it', async () => {
  const spec = {
    sheets: SHEET_ONE,
    rawSharedStrings: `<!DOCTYPE sst [<!ENTITY x SYSTEM "file:///etc/hostname">]><sst xmlns="${MAIN_NS}"><si><t>&x;</t></si></sst>`,
  };

  expect(await codeOf(spec)).toBe('RST-1923');
});

it('RF-151 refuses a document type in a sheet part and in workbook.xml', async () => {
  const inSheet = { sheets: [{ name: 'S', xml: `<!DOCTYPE worksheet>${worksheet('')}` }] };

  expect(await codeOf(inSheet)).toBe('RST-1923');
  expect(
    await codeOf({
      sheets: SHEET_ONE,
      rawWorkbookXml: `<!DOCTYPE workbook><workbook xmlns="${MAIN_NS}"/>`,
    }),
  ).toBe('RST-1923');
});

function nested(depth: number): string {
  return `${'<a>'.repeat(depth)}${'</a>'.repeat(depth)}`;
}

it('RF-151 refuses 65 nested elements with RST-1923', async () => {
  // The worksheet element is level 1, so 64 nested elements below it make 65.
  const sheets = [{ name: 'S', xml: worksheet('', nested(64)) }];

  expect(await codeOf({ sheets })).toBe('RST-1923');
});

it('RF-151 accepts exactly 64 nested elements', async () => {
  const sheets = [{ name: 'S', xml: worksheet('', nested(63)) }];

  expect(await codeOf({ sheets })).toBeUndefined();
});

it('RF-151 refuses a truncated sheet with RST-1927 naming the part', async () => {
  const bytes = await buildWorkbook({
    sheets: [
      { name: 'S', xml: `<worksheet xmlns="${MAIN_NS}"><sheetData><row r="1"><c r="A1"><v>1` },
    ],
  });

  const failure: unknown = await readBuilt(root.path, bytes).catch((error: unknown) => error);

  expect(failure).toMatchObject({ code: 'RST-1927' });
  expect(failure).toHaveProperty('message', expect.stringContaining('xl/worksheets/sheet1.xml'));
});

it('RF-151 refuses an entity reference that no declaration defines with RST-1927', async () => {
  const sheets = [{ name: 'S', xml: worksheet(row(1, numberCell('A1', 1)), '<x>&nope;</x>') }];

  expect(await codeOf({ sheets })).toBe('RST-1927');
});
