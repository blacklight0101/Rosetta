import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007, RF-151: the plain message and the next step of the workbook codes (RST-1921..1928 and RST-1931), in
// numeric order. descriptions.ts merges them with the rest; describeError there is the only way to
// read them. The message of a thrown error names the file and the limit; these are the page text.

export type WorkbookErrorCode = Extract<
  ErrorCode,
  | 'RST-1921'
  | 'RST-1922'
  | 'RST-1923'
  | 'RST-1924'
  | 'RST-1925'
  | 'RST-1926'
  | 'RST-1927'
  | 'RST-1928'
  | 'RST-1931'
>;

export const WORKBOOK_ERROR_DESCRIPTIONS: Readonly<Record<WorkbookErrorCode, ErrorDescription>> = {
  'RST-1921': {
    message: 'The workbook is in a legacy format (.xls or .xlsb) that Rosetta does not read.',
    nextStep:
      'Open the file in Excel and save it as .xlsx (or .xlsm if it has macros), then upload it again.',
  },
  'RST-1922': {
    message: 'The workbook is password-protected, so Rosetta cannot read it.',
    nextStep: 'Remove the password in Excel and upload again.',
  },
  'RST-1923': {
    message:
      'The workbook holds XML with a document type, an entity declaration or nesting that is too deep, which Rosetta refuses.',
    nextStep:
      'The file holds content Rosetta does not read; save it again from Excel and upload again.',
  },
  'RST-1924': {
    message: 'The upload holds more workbooks than the limit of this server.',
    nextStep: 'Upload fewer workbooks, or split them into separate projects.',
  },
  'RST-1925': {
    message: 'A workbook has more sheets than the limit of this server.',
    nextStep: 'Remove unused sheets from the workbook and upload again.',
  },
  'RST-1926': {
    message:
      'The workbooks hold more cells, shared strings or XML data than the limit of this server.',
    nextStep: 'Remove data that is not part of the system and upload again.',
  },
  'RST-1927': {
    message:
      'The workbook cannot be read: the package is damaged, a part is missing or its XML is not well formed.',
    nextStep: 'The file is damaged; open it in Excel, save it again and upload again.',
  },
  'RST-1928': {
    message: 'Two workbooks in the upload have the same name.',
    nextStep: 'Rename one of the two files and upload again.',
  },
  'RST-1931': {
    message:
      'A workbook holds a formula longer than 8,192 characters, which Excel cannot write and Rosetta does not read.',
    nextStep: 'Shorten or split that formula in Excel, or remove it, and upload again.',
  },
};
