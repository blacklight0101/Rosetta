import { describe, expect, it } from 'vitest';
import { noStoredData } from '../../../../src/domain/planning/stored-data-cards.js';
import { card } from '../../../support/data-model-sqlserver-orders.js';
import { catalogCards, invoiceCards } from '../../../support/data-model-defect-cards.js';

// P7-13, RF-623, EV-31, EV-40: an ENT card that describes no stored data (a configuration, a view
// model, a registration, a glossary, the workbook file itself) gets no table.

const titled = (title: string) => card('ENT-100', 'ENT', title, ['It is described.']);

describe('noStoredData', () => {
  it('RF-623 names the cards of the eShop evaluation that store nothing', () => {
    const kinds = catalogCards().map((each) => noStoredData(each));

    expect(kinds.slice(0, 4)).toEqual([undefined, undefined, undefined, undefined]);
    expect(kinds[4]).toBe('configuration');
    expect(kinds[5]).toBe('registration');
    expect(kinds[6]).toBe('configuration');
    expect(kinds[7]).toBe('view model');
  });

  it('RF-623 names the glossary and the workbook file of the Invoice evaluation', () => {
    const kinds = invoiceCards().map((each) => noStoredData(each));

    expect(kinds).toEqual([undefined, 'glossary', 'workbook file']);
  });

  it.each([
    ['Invoice_Generator.xlsm', 'workbook file'],
    ['Workbook Structure and Dependencies', 'workbook file'],
    ['Named ranges of the Asset Manager workbook', 'workbook file'],
    ['Paginated items view model', 'view model'],
    ['CatalogViewModel', 'view model'],
    ['Application configuration', 'configuration'],
  ])('RF-623 skips %s', (title, kind) => {
    expect(noStoredData(titled(title))).toBe(kind);
  });

  it.each([
    'Configuration table',
    'Workbook Sheets Data',
    'Customer Table',
    'User registration',
    'Support sheet totals',
    'Order',
    'Invoice sheet of the workbook',
  ])('RF-623 keeps %s', (title) => {
    expect(noStoredData(titled(title))).toBeUndefined();
  });

  it('RF-623 reads only the ENT cards title, not its claims', () => {
    const named = card('ENT-100', 'ENT', 'Order', ['The configuration of the view model.']);

    expect(noStoredData(named)).toBeUndefined();
  });
});
