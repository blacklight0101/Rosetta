import type { CitedExcerpt } from '../../src/application/verifier/cited-lines.js';
import type { OwnerAnswer } from '../../src/application/verifier/answer-restated-claim.js';

// DEC-198, EV-56: the texts of the Invoice Deepen 90c48e40 (the public Invoice_Generator test
// workbook): the sheet table the question OQ-002 was raised from, the owner's typed answer, and the
// claims the reader wrote from that answer (FEAT-002.c3 is the real FEAT-001.c14 of the report).

export const SHEETS_FILE = 'Invoice_Generator.xlsm/workbook.md';

export const sheetTable = [
  '| Instructions | sheet | "Instructions" |',
  '| Dashboard | sheet | "Dashboard" |',
  '| Invoice | sheet | "Invoice" |',
  '| Masterdata | sheet | "Masterdata" |',
  '| Template | sheet | "Template" |',
  '| Calculation | sheet | "Calculation" |',
  '| VBA_Code_Glossary | sheet | "VBA Code Glossary" |',
];

/** The cited lines `workbook.md:14-20` as the verifier reads them. */
export const sheetExcerpt: CitedExcerpt = {
  ...{ path: SHEETS_FILE, startLine: 14, endLine: 20, skipped: false },
  lines: sheetTable,
};

export const oq002: OwnerAnswer = {
  ...{ area: 'Invoice_Generator.xlsm', cardId: 'OQ-002' },
  context: `${SHEETS_FILE}:14-20 The workbook contains sheets named 'Instructions', 'Dashboard', 'Invoice', 'Masterdata', 'Template', 'Calculation', and 'VBA Code Glossary'.`,
  answer:
    'From README.md (How It Works): customer data is kept in Masterdata (Add Customer / Edit Master Data on the Dashboard); a new invoice is entered in the Invoice sheet (customer picked through the orange search cell); Create Invoices lists open invoices with a blank status, fills the Template sheet and exports the invoice as PDF and Excel into two folders, and can draft an Outlook email with the PDF attached; the Calculation sheet then feeds the monthly revenue chart on the Dashboard.',
};

/** FEAT-002.c3 of the Deepen, Supported by the verifier (the FEAT-001.c14 of EV-56). */
export const featureC3 =
  'The Create Invoices macro generates open invoices with a blank status, populates the Template sheet, and exports the invoice as PDF and Excel into two specific folders.';

/** The reader's other restatements of the answer that the Deepen left Supported. */
export const restatedClaims = [
  'Customer data is maintained in the Masterdata sheet, where users can Add Customer or Edit Master Data via the Dashboard sheet.',
  'The Calculation sheet feeds data used to display the monthly revenue chart on the Dashboard.',
];

/** True claims about what the sheet table shows; the rule must leave them to the verifier. */
export const sheetListClaims = [
  'The workbook has a Dashboard sheet, an Invoice sheet and a Masterdata sheet.',
  'The workbook holds the sheets Dashboard, Invoice, Masterdata, Template and Calculation.',
  'Invoice, Template and Calculation are sheets of the workbook.',
  'The Dashboard sheet and the Invoice sheet exist.',
  "The workbook contains sheets named 'Instructions', 'Dashboard', 'Invoice', 'Masterdata', 'Template', 'Calculation', and 'VBA Code Glossary'.",
];
