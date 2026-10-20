import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';

// RF-151: the refusals of the workbook reader. The message is for the log; the page shows the
// catalogue text of the code (RF-007, RF-158). Names come from the file, so they are quoted and cut.

const NAME_LIMIT = 120;

export function quoted(name: string): string {
  return JSON.stringify(name.length > NAME_LIMIT ? `${name.slice(0, NAME_LIMIT)}...` : name);
}

/** RST-1921: a legacy `.xls` or an `.xlsb`. */
export function workbookLegacyFormat(fileName: string, detail: string): RosettaError {
  return new RosettaError(
    ERROR_CODES.workbookLegacyFormat,
    `The workbook ${quoted(fileName)} is ${detail}; open it in Excel and save it as .xlsx.`,
  );
}

/** RST-1922: a password-protected workbook. */
export function workbookEncrypted(fileName: string): RosettaError {
  return new RosettaError(
    ERROR_CODES.workbookEncrypted,
    `The workbook ${quoted(fileName)} is password-protected.`,
  );
}

/** RST-1923: a document type, an entity declaration or nesting deeper than the limit. */
export function workbookXmlRefused(part: string, reason: string): RosettaError {
  return new RosettaError(
    ERROR_CODES.workbookXmlRefused,
    `The workbook part ${quoted(part)} ${reason}.`,
  );
}

/** RST-1924: more workbooks than the limit. */
export function workbookTooManyFiles(limit: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.workbookTooManyFiles,
    `The upload holds more than ${String(limit)} workbooks.`,
  );
}

/** RST-1925: more sheets in one workbook than the limit. */
export function workbookTooManySheets(fileName: string, limit: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.workbookTooManySheets,
    `The workbook ${quoted(fileName)} holds more than ${String(limit)} sheets.`,
  );
}

/** RST-1926: too many non-empty cells, shared strings or inflated XML bytes. */
export function workbookTooLarge(what: string, limit: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.workbookTooLarge,
    `The workbooks hold more than ${String(limit)} ${what}.`,
  );
}

/** RST-1927: a damaged package, a missing part or XML that is not well formed. */
export function workbookNotReadable(part: string, detail: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.workbookNotReadable,
    `The workbook part ${quoted(part)} could not be read: ${detail}.`,
    { cause },
  );
}

/** RST-1928: two workbooks with the same name in one upload. */
export function workbookDuplicateName(name: string): RosettaError {
  return new RosettaError(
    ERROR_CODES.workbookDuplicateName,
    `Two workbooks in the upload are named ${quoted(name)}.`,
  );
}

/** RST-1931: a formula longer than Excel can write; `place` says where it was read. */
export function workbookFormulaTooLong(
  fileName: string,
  place: string,
  limit: number,
): RosettaError {
  return new RosettaError(
    ERROR_CODES.workbookFormulaTooLong,
    `The workbook ${quoted(fileName)} holds a formula longer than ${limit.toLocaleString('en-US')} characters (${place}); Excel cannot write such a formula.`,
  );
}
