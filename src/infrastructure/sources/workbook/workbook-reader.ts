import { openPromise, type ZipFile } from 'yauzl';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { ERROR_CODES, type ErrorCode } from '../../../domain/errors/codes.js';
import type { LimitCounter } from '../entry-guards.js';
import { planExtraction } from '../zip-entry-plan.js';
import { PackageReader } from './package-reader.js';
import { checkFileName, kindOf, refusalForCompound } from './workbook-format.js';
import { quoted, workbookNotReadable } from './workbook-errors.js';
import type { WorkbookLimits } from './workbook-limits.js';
import type { WorkbookModel } from './workbook-model.js';
import { WorkbookPackage } from './workbook-package.js';

// RF-127, RF-129, RF-151, ADR-022, ADR-023: opens one workbook (`.xlsx` or `.xlsm`) under the zip
// guards, streams its parts into the XML reader and returns the typed model. Nothing is written
// to disk, nothing is fetched, no formula is evaluated and no macro is run.

export interface WorkbookFile {
  /** Where the uploaded file is; it is only read. */
  readonly path: string;
  /** The name the user gave it, which decides the extension check. */
  readonly fileName: string;
}

/** The refusals of the zip guards (RST-1909..1915); their message gets the workbook name added. */
const ZIP_CODES: ReadonlySet<ErrorCode> = new Set([
  ERROR_CODES.zipNotReadable,
  ERROR_CODES.zipTooLarge,
  ERROR_CODES.zipTooManyEntries,
  ERROR_CODES.zipRatioTooHigh,
  ERROR_CODES.zipEntryPathUnsafe,
  ERROR_CODES.zipEntryUnsupported,
  ERROR_CODES.zipEmpty,
]);

/** A zip refusal says which workbook it was found in; the entry it names is the sheet or part. */
function failureOf(error: unknown, fileName: string, signal: AbortSignal): unknown {
  if (signal.aborted) return error;
  if (error instanceof RosettaError) {
    if (!ZIP_CODES.has(error.code)) return error;
    return new RosettaError(error.code, `${error.message} (in the workbook ${quoted(fileName)})`, {
      cause: error,
    });
  }
  return workbookNotReadable(fileName, 'it is not a readable package', error);
}

async function readPackage(
  file: WorkbookFile,
  limits: WorkbookLimits,
  cells: LimitCounter,
  signal: AbortSignal,
): Promise<WorkbookModel> {
  let zip: ZipFile | undefined;
  try {
    // The library's own size validation is off: a header that lies about a size ends in our
    // byte counts (RST-1926, RST-1910) or size check (RST-1909), not in an error of the library.
    zip = await openPromise(file.path, {
      lazyEntries: true,
      autoClose: false,
      decodeStrings: false,
      validateEntrySizes: false,
    });
    const plan = await planExtraction(zip, limits.zip);
    const pkg = new WorkbookPackage(zip, plan.files, { limits, signal });
    return await new PackageReader(pkg, file.fileName, limits, cells).read();
  } catch (error) {
    throw failureOf(error, file.fileName, signal);
  } finally {
    zip?.close();
  }
}

/**
 * Reads a workbook into a model. `cells` counts the non-empty cells of the whole project, so the
 * workbooks of one upload share it; a cell past the limit stops the read (RST-1926).
 */
// RF-151
export async function readWorkbook(
  file: WorkbookFile,
  limits: WorkbookLimits,
  cells: LimitCounter,
  signal: AbortSignal,
): Promise<WorkbookModel> {
  checkFileName(file.fileName);
  const kind = await kindOf(file.path);
  if (kind === 'compound') throw await refusalForCompound(file.path, file.fileName);
  if (kind === 'other') {
    throw workbookNotReadable(file.fileName, 'the file is not a workbook package');
  }
  return readPackage(file, limits, cells, signal);
}
