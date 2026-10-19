import { expect, it } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { buildCompoundFile } from '../../../../support/compound-fixtures.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  numberCell,
  readBuilt,
  row,
  worksheet,
} from '../../../../support/workbook-fixtures.js';

const root = useWritableTempRoot('rosetta-workbook-format-');

async function failureOf(bytes: Buffer, fileName = 'Book.xlsx'): Promise<RosettaError> {
  try {
    await readBuilt(root.path, bytes, { fileName });
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('expected the file to be refused');
}

it('RF-151 refuses an encrypted workbook renamed .xlsx with RST-1922', async () => {
  const bytes = buildCompoundFile(['EncryptionInfo', 'EncryptedPackage']);

  const failure = await failureOf(bytes);

  expect(failure.code).toBe('RST-1922');
  expect(failure.nextStep).toContain('Remove the password in Excel');
});

it('RF-151 refuses a legacy .xls renamed .xlsx with RST-1921', async () => {
  const failure = await failureOf(buildCompoundFile(['Workbook', 'SummaryInformation']));

  expect(failure.code).toBe('RST-1921');
  expect(failure.nextStep).toContain('save it as .xlsx');
});

it('RF-151 takes a stream named Book for an old .xls too', async () => {
  expect((await failureOf(buildCompoundFile(['Book']))).code).toBe('RST-1921');
});

it('RF-151 refuses a compound file that is neither with RST-1927', async () => {
  expect((await failureOf(buildCompoundFile(['WordDocument']))).code).toBe('RST-1927');
});

it('RF-151 refuses an .xlsb, a package holding xl/workbook.bin, with RST-1921', async () => {
  const bytes = await buildWorkbook({
    sheets: [{ name: 'S' }],
    extraParts: [{ name: 'xl/workbook.bin', data: 'binary workbook' }],
  });

  expect((await failureOf(bytes, 'Book.xlsb')).code).toBe('RST-1921');
  expect((await failureOf(bytes)).code).toBe('RST-1921');
});

it('RF-151 refuses the names .xls and .xlsb at once, whatever the content', async () => {
  const bytes = await buildWorkbook({ sheets: [{ name: 'S' }] });

  expect((await failureOf(bytes, 'Old.xls')).code).toBe('RST-1921');
  expect((await failureOf(bytes, 'Old.XLSB')).code).toBe('RST-1921');
});

it('RF-151 refuses a name that is not .xlsx or .xlsm with RST-1927', async () => {
  const bytes = await buildWorkbook({ sheets: [{ name: 'S' }] });

  expect((await failureOf(bytes, 'Book.csv')).code).toBe('RST-1927');
});

it('RF-151 refuses a file that is neither a package nor a compound file with RST-1927', async () => {
  expect((await failureOf(Buffer.from('just some text, not a workbook'))).code).toBe('RST-1927');
});

it('RF-151 reads an .xlsm like an .xlsx', async () => {
  const bytes = await buildWorkbook({
    sheets: [{ name: 'S', xml: worksheet(row(1, numberCell('A1', 1))) }],
  });

  const model = await readBuilt(root.path, bytes, { fileName: 'Macros.XLSM' });

  expect(model.fileName).toBe('Macros.XLSM');
});

it('RF-151 refuses a package without xl/workbook.xml with RST-1927 naming it', async () => {
  const bytes = await buildWorkbook({ sheets: [{ name: 'S' }], omitWorkbookXml: true });

  const failure = await failureOf(bytes);

  expect(failure.code).toBe('RST-1927');
  expect(failure.message).toContain('xl/workbook.xml');
});

it('RF-151 refuses a sheet named in workbook.xml.rels but missing, naming the part', async () => {
  const bytes = await buildWorkbook({
    sheets: [{ name: 'A' }, { name: 'B' }],
    omitSheetParts: [2],
  });

  const failure = await failureOf(bytes);

  expect(failure.code).toBe('RST-1927');
  expect(failure.message).toContain('xl/worksheets/sheet2.xml');
});

it('RF-151 refuses a sheet whose relationship id the rels do not list', async () => {
  const bytes = await buildWorkbook({
    sheets: [{ name: 'A' }],
    rawWorkbookXml:
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="A" sheetId="1" r:id="rId99"/></sheets></workbook>',
  });

  expect((await failureOf(bytes)).code).toBe('RST-1927');
});

it('RF-151 refuses a zip with damaged data with RST-1927', async () => {
  const bytes = await buildWorkbook({ sheets: [{ name: 'S' }] });
  const damaged = Buffer.concat([
    bytes.subarray(0, 60),
    Buffer.alloc(40, 0xff),
    bytes.subarray(100),
  ]);

  expect((await failureOf(damaged)).code).toBe('RST-1927');
});

it('RF-151 stops a read whose signal is aborted', async () => {
  const bytes = await buildWorkbook({ sheets: [{ name: 'S' }] });
  const controller = new AbortController();
  controller.abort();

  await expect(readBuilt(root.path, bytes, { signal: controller.signal })).rejects.toThrow();
});
