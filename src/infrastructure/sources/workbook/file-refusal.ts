import { ERROR_CODES, type ErrorCode } from '../../../domain/errors/codes.js';
import { FileRefusedError } from '../../../domain/errors/file-refused.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';

// RF-150, RF-158: a refusal about one workbook is told with the file it is about, so the page can
// name the file, the reason and the next step. Refusals that are about the upload as a whole (its
// size, its time, the free space) are not about a file and stay as they are.

/** The codes of a workbook that cannot be read: the zip guards applied to the package and RST-1921..1928 and RST-1931. */
const ABOUT_A_FILE: ReadonlySet<ErrorCode> = new Set([
  ERROR_CODES.zipNotReadable,
  ERROR_CODES.zipTooLarge,
  ERROR_CODES.zipTooManyEntries,
  ERROR_CODES.zipRatioTooHigh,
  ERROR_CODES.zipEntryPathUnsafe,
  ERROR_CODES.zipEntryUnsupported,
  ERROR_CODES.zipEmpty,
  ERROR_CODES.workbookLegacyFormat,
  ERROR_CODES.workbookEncrypted,
  ERROR_CODES.workbookXmlRefused,
  ERROR_CODES.workbookTooManyFiles,
  ERROR_CODES.workbookTooManySheets,
  ERROR_CODES.workbookTooLarge,
  ERROR_CODES.workbookNotReadable,
  ERROR_CODES.workbookDuplicateName,
  ERROR_CODES.workbookFormulaTooLong,
]);

/** The same refusal with the file it is about; any other failure as it was. */
export function namedRefusal(fileName: string, error: unknown): unknown {
  if (!(error instanceof RosettaError) || error instanceof FileRefusedError) return error;
  return ABOUT_A_FILE.has(error.code)
    ? new FileRefusedError(error.code, fileName, { cause: error })
    : error;
}

/** Runs `step`; a refusal about the file comes out naming it. */
export async function refusingFile<T>(fileName: string, step: () => Promise<T> | T): Promise<T> {
  try {
    return await step();
  } catch (error) {
    throw namedRefusal(fileName, error);
  }
}
