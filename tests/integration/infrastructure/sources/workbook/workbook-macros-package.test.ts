import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { DEFAULT_MACRO_LIMITS } from '../../../../../src/infrastructure/sources/workbook/macro-limits.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import { buildVbaProject } from '../../../../support/vba-project.js';
import { buildWorkbook, readBuilt } from '../../../../support/workbook-fixtures.js';

// RF-154: the package reader hands `xl/vbaProject.bin` to the macro reader; a workbook without it
// is read exactly as before.

const root = useWritableTempRoot('rosetta-workbook-macros-');
const SHEETS = [{ name: 'Data' }];

it('RF-154 puts the macros of an .xlsm in the workbook model', async () => {
  const project = buildVbaProject({
    modules: [{ name: 'Module1', kind: 'standard', source: 'Sub A()\r\nEnd Sub\r\n' }],
  });
  const bytes = await buildWorkbook({
    sheets: SHEETS,
    extraParts: [{ name: 'xl/vbaProject.bin', data: project }],
  });

  const model = await readBuilt(root.path, bytes, { fileName: 'Pricing.xlsm' });

  expect(model.hasMacros).toBe(true);
  expect(model.macros?.state).toBe('readable');
  expect(model.macros?.modules.map((module) => module.name)).toEqual(['Module1']);
});

it('RF-154 leaves the model of a workbook without macros as it was', async () => {
  const model = await readBuilt(root.path, await buildWorkbook({ sheets: SHEETS }));

  expect(model.hasMacros).toBe(false);
  expect(Object.keys(model)).not.toContain('macros');
});

it('RF-154 still reads the workbook when its vbaProject.bin is not a compound file', async () => {
  const bytes = await buildWorkbook({
    sheets: SHEETS,
    extraParts: [{ name: 'xl/vbaProject.bin', data: 'not a compound file' }],
  });

  const model = await readBuilt(root.path, bytes, { fileName: 'Broken.xlsm' });

  expect(model.sheets.map((sheet) => sheet.name)).toEqual(['Data']);
  expect(model.macros?.state).toBe('unreadable');
});

it('RF-154 refuses a vbaProject.bin that inflates past the project limit', async () => {
  const project = buildVbaProject({
    modules: [{ name: 'Module1', kind: 'standard', source: 'Sub A()\r\nEnd Sub\r\n' }],
  });
  const bytes = await buildWorkbook({
    sheets: SHEETS,
    extraParts: [{ name: 'xl/vbaProject.bin', data: project }],
  });
  const macros = { ...DEFAULT_MACRO_LIMITS, maxProjectBytes: 1000 };

  const outcome = await readBuilt(root.path, bytes, {
    fileName: 'Big.xlsm',
    limits: { macros },
  }).catch((error: unknown) => error);

  expect(outcome instanceof RosettaError ? outcome.code : outcome).toBe(
    ERROR_CODES.workbookTooLarge,
  );
});
