import { open, readFile, stat } from 'node:fs/promises';
import CFB from 'cfb';
import { compoundFileProblem } from './compound-guard.js';
import type { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { workbookEncrypted, workbookLegacyFormat, workbookNotReadable } from './workbook-errors.js';

// RF-151: a file is judged by its content as well as its name. A package starts with the zip
// signature; a file that starts with the compound-file signature is opened with `cfb` only to
// tell a password-protected workbook from an old `.xls`, and is refused either way (ADR-023).

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const COMPOUND_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
/** A compound file is read whole to be named; a bigger one is refused rather than held in memory. */
const MAX_COMPOUND_BYTES = 128 * 1024 * 1024;

export type FileKind = 'package' | 'compound' | 'other';

/** The extension must be `.xlsx` or `.xlsm`; `.xls` and `.xlsb` are named as legacy formats. */
export function checkFileName(fileName: string): void {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) return;
  if (lower.endsWith('.xls') || lower.endsWith('.xlsb')) {
    throw workbookLegacyFormat(fileName, 'a legacy Excel format');
  }
  throw workbookNotReadable(fileName, 'only .xlsx and .xlsm files are read');
}

export async function kindOf(path: string): Promise<FileKind> {
  const handle = await open(path, 'r');
  try {
    const head = Buffer.alloc(ZIP_SIGNATURE.length);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    const start = head.subarray(0, bytesRead);
    if (start.equals(ZIP_SIGNATURE)) return 'package';
    return start.equals(COMPOUND_SIGNATURE) ? 'compound' : 'other';
  } finally {
    await handle.close();
  }
}

/** The error for a compound file: password-protected (`EncryptionInfo`), legacy (`Workbook`, `Book`) or neither. */
export async function refusalForCompound(path: string, fileName: string): Promise<RosettaError> {
  if ((await stat(path)).size > MAX_COMPOUND_BYTES) {
    return workbookNotReadable(fileName, 'the compound file is too large to identify');
  }
  try {
    const bytes = await readFile(path);
    const problem = compoundFileProblem(bytes);
    if (problem !== undefined) {
      return workbookNotReadable(fileName, `the compound file cannot be read safely: ${problem}`);
    }
    const names = new Set(CFB.read(bytes, { type: 'buffer' }).FileIndex.map((e) => e.name));
    if (names.has('EncryptionInfo')) return workbookEncrypted(fileName);
    if (names.has('Workbook') || names.has('Book')) {
      return workbookLegacyFormat(fileName, 'a legacy .xls');
    }
    return workbookNotReadable(fileName, 'the compound file is not an Excel workbook');
  } catch (error) {
    return workbookNotReadable(fileName, 'the compound file is damaged', error);
  }
}
