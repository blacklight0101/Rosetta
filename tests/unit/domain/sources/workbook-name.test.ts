import { describe, expect, it } from 'vitest';
import { workbookFileName } from '../../../../src/domain/sources/workbook-name.js';

// RF-150, RF-158: a name with nothing before its extension is no name, as for a zip (RF-128).

describe('workbookFileName an empty stem', () => {
  it.each(['.xlsx', '.XLSM', '%20.xlsx', '%20%20.xlsm', '.xls'])(
    'RF-150 refuses %s as missing',
    (sent) => {
      expect(workbookFileName(sent)).toEqual({ ok: false, error: 'missing' });
    },
  );

  it('RF-150 keeps a name with a stem, and a name with another extension for the reader to judge', () => {
    expect(workbookFileName('Pricing.xlsx')).toEqual({ ok: true, value: 'Pricing.xlsx' });
    expect(workbookFileName('.hidden')).toEqual({ ok: true, value: '.hidden' });
  });
});
