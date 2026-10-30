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

describe('noStoredData: claims that state stored data (P7-13 round 2)', () => {
  const said = (title: string, ...claims: string[]) => card('ENT-100', 'ENT', title, claims);

  it.each([
    ['Printer Configuration', 'Column Printer.Name: varchar(50), NOT NULL.'],
    ['Tax Parameters', 'The Tax table has the columns Rate and Region.'],
    ['Report Parameters', 'ReportParameter has a primary key Id and a foreign key to Report.'],
    ['Configuration Item (CMDB)', 'Each configuration item is a row with a nullable Owner column.'],
    ['Workbook Entries', 'The entries are rows of a table with the columns Date and Amount.'],
    ['OrderViewModel', 'The Total is a decimal(19,4) value that is NOT NULL.'],
  ])('RF-623 keeps %s, whose claims state stored data', (title, claim) => {
    expect(noStoredData(said(title, claim))).toBeUndefined();
  });

  it.each([
    ['Printer Configuration', 'configuration'],
    ['Tax Parameters', 'configuration'],
    ['Workbook Entries', 'workbook file'],
  ])('RF-623 still skips %s when its claims state none', (title, kind) => {
    expect(noStoredData(said(title, 'The class reads its values from the settings file.'))).toBe(
      kind,
    );
  });

  it('RF-623 keeps the card of the Ollama eShop that holds the precision of a price (ENT-120)', () => {
    const entity = said(
      'EntityModel Configuration and Entities',
      'The CatalogItem Price has precision 19,4.',
      'The CatalogBrand Brand is not unicode.',
    );

    expect(noStoredData(entity)).toBeUndefined();
  });

  it.each(['Application Entities and Configuration', 'Configuration entity'])(
    'RF-623 counts an entity as data: %s',
    (title) => {
      expect(noStoredData(said(title, 'It is described.'))).toBeUndefined();
    },
  );
});

describe('noStoredData: classes that only serve (P7-13 round 2)', () => {
  const said = (title: string, ...claims: string[]) => card('ENT-100', 'ENT', title, claims);

  it.each(['SqlDataService', 'WebFormsService', 'ActivityIdHelper', 'ServiceContainer'])(
    'RF-623 skips the class %s',
    (title) => {
      expect(noStoredData(said(title, 'It calls the service.'))).toBe('service class');
    },
  );

  it.each(['Service', 'Customer Service', 'Service table', 'Helper'])(
    'RF-623 keeps %s, which is not the name of a class',
    (title) => {
      expect(noStoredData(said(title, 'It is described.'))).toBeUndefined();
    },
  );

  it('RF-623 keeps a service class whose claims state stored data', () => {
    const named = said('SqlDataService', 'Column Orders.Id: int, NOT NULL.');

    expect(noStoredData(named)).toBeUndefined();
  });
});
