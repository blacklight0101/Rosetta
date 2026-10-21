import type {
  WorkbookCell,
  WorkbookModel,
  WorkbookSheet,
  WorkbookTable,
} from '../../src/infrastructure/sources/workbook/workbook-model.js';
import { fakeAnthropicKey } from './secret-fixture.js';
import { book, cell, num, sheet, text } from './rendered-workbook-fixtures.js';

// P3-94: a small made-up invoicing workbook whose calculated columns have the shape of a real
// invoice generator: an `InvoiceTable` on the Invoice sheet with a sum of three amount columns, a
// total plus expenses, a net plus VAT, a due date by `WORKDAY` guarded by `IF(date="","")`, a net
// times VAT and a shared formula, a Calculation sheet that adds the table up with `SUMIFS` and a
// Template sheet with a `SUM`. Every name and number is invented. Built as a typed model, so a test
// renders it with the real renderer.

export const invoiceColumns = [
  'Invoice No',
  'Invoice Date',
  'Customer',
  'Amount Line 1',
  'Amount Line 2',
  'Amount Line 3',
  'Agreed Amount Total',
  'Additional Expenses',
  'Total With Expenses',
  'VAT Rate',
  'Net Amount',
  'VAT to Pay',
  'Final Invoiced Amount',
  'Due Date',
  'Transfer Savings',
] as const;

/** 2026-03-01 and the date 14 working days later (2026-03-19). */
const INVOICE_DATE = 46082;
const DUE_DATE = 46100;
const DATE_FORMAT = 'yyyy-mm-dd';
const FIRST_ROW = 8;
const HEADER_ROW = 7;

const customers = [
  'Alder Foods Ltd',
  'Birch Logistics',
  'Cedar Packaging',
  'Alder Foods Ltd',
  'Birch Logistics',
] as const;

const thisRow = (column: string): string => `InvoiceTable[[#This Row],[${column}]]`;

export const invoiceFormulas = {
  agreed: `${thisRow('Amount Line 1')}+${thisRow('Amount Line 2')}+${thisRow('Amount Line 3')}`,
  withExpenses: `${thisRow('Agreed Amount Total')}+${thisRow('Additional Expenses')}`,
  vat: `${thisRow('Net Amount')}*${thisRow('VAT Rate')}`,
  final: `${thisRow('Net Amount')}+${thisRow('VAT to Pay')}`,
  due: `IF(${thisRow('Invoice Date')}="","",WORKDAY(${thisRow('Invoice Date')},14))`,
  savings: 'G8*0.5',
  summary: 'SUMIFS(InvoiceTable[Final Invoiced Amount],InvoiceTable[Customer],A2)',
  template: 'SUM(D5:D14)',
} as const;

const normal = (formula: string) => ({ kind: 'normal', text: formula }) as const;

interface Line {
  readonly row: number;
  readonly amounts: readonly [number, number, number];
  readonly expenses: number;
  readonly vatRate: number;
}

function lines(): Line[] {
  return customers.map((_customer, index) => ({
    row: FIRST_ROW + index,
    amounts: [100 + index * 10, 50 + index, 25],
    expenses: 10 * (index + 1),
    vatRate: 0.25,
  }));
}

function totalsOf(line: Line) {
  const agreed = line.amounts[0] + line.amounts[1] + line.amounts[2];
  const withExpenses = agreed + line.expenses;
  const vat = withExpenses * line.vatRate;
  return { agreed, withExpenses, vat, final: withExpenses + vat };
}

function cellsOf(line: Line, customer: string): WorkbookCell[] {
  const { row } = line;
  const totals = totalsOf(line);
  const at = (column: string) => `${column}${String(row)}`;
  const shared = (first: boolean) => ({
    kind: 'shared' as const,
    text: first ? invoiceFormulas.savings : '',
    sharedIndex: 0,
    ...(first
      ? { range: `O${String(FIRST_ROW)}:O${String(FIRST_ROW + customers.length - 1)}` }
      : {}),
  });
  return [
    cell(at('A'), text(`INV-${String(1000 + row)}`)),
    cell(at('B'), num(INVOICE_DATE), { numberFormat: DATE_FORMAT }),
    cell(at('C'), text(customer)),
    cell(at('D'), num(line.amounts[0])),
    cell(at('E'), num(line.amounts[1])),
    cell(at('F'), num(line.amounts[2])),
    cell(at('G'), num(totals.agreed), { formula: normal(invoiceFormulas.agreed) }),
    cell(at('H'), num(line.expenses)),
    cell(at('I'), num(totals.withExpenses), { formula: normal(invoiceFormulas.withExpenses) }),
    cell(at('J'), num(line.vatRate)),
    cell(at('K'), num(totals.withExpenses)),
    cell(at('L'), num(totals.vat), { formula: normal(invoiceFormulas.vat) }),
    cell(at('M'), num(totals.final), { formula: normal(invoiceFormulas.final) }),
    cell(at('N'), num(DUE_DATE), {
      numberFormat: DATE_FORMAT,
      formula: normal(invoiceFormulas.due),
    }),
    cell(at('O'), num(totals.agreed * 0.5), { formula: shared(row === FIRST_ROW) }),
  ];
}

export const invoiceTable: WorkbookTable = {
  name: 'InvoiceTable',
  range: `A${String(HEADER_ROW)}:O${String(FIRST_ROW + customers.length - 1)}`,
  columns: invoiceColumns,
};

function invoiceSheet(): WorkbookSheet {
  const header = invoiceColumns.map((name, index) =>
    cell(`${String.fromCharCode(65 + index)}${String(HEADER_ROW)}`, text(name)),
  );
  const body = lines().flatMap((line, index) => cellsOf(line, customers[index] ?? ''));
  return sheet('Invoice', { cells: [...header, ...body], tables: [invoiceTable] });
}

/** The text of a cell that echoes a customer and a contact key; the key is a fake secret. */
export const contactNote = `Contact key ${fakeAnthropicKey}`;

function calculationSheet(): WorkbookSheet {
  const total = (name: string) =>
    lines()
      .filter((_line, index) => customers[index] === name)
      .reduce((sum, line) => sum + totalsOf(line).final, 0);
  return sheet('Calculation', {
    cells: [
      cell('A1', text('Customer')),
      cell('B1', text('Invoiced')),
      cell('A2', text('Alder Foods Ltd')),
      cell('B2', num(total('Alder Foods Ltd')), { formula: normal(invoiceFormulas.summary) }),
      cell('A3', text('Birch Logistics')),
      cell('B3', num(total('Birch Logistics')), {
        formula: normal(invoiceFormulas.summary.replace('A2', 'A3')),
      }),
      cell('C2', text(contactNote), { formula: normal('"Contact key "&INDEX(Keys!A:A,1)') }),
    ],
  });
}

function templateSheet(): WorkbookSheet {
  return sheet('Template', {
    cells: [
      cell('D5', num(0)),
      cell('D6', num(0)),
      cell('D15', num(0), { formula: normal(invoiceFormulas.template) }),
    ],
  });
}

/** The invoicing workbook: Invoice (with its table), Calculation and Template. */
export function invoiceWorkbook(): WorkbookModel {
  return book([invoiceSheet(), calculationSheet(), templateSheet()], {
    fileName: 'Invoice_Sample.xlsm',
  });
}
