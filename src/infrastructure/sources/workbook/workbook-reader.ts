import type { LimitCounter } from '../entry-guards.js';
import type { WorkbookLimits } from './workbook-limits.js';
import type { WorkbookModel } from './workbook-model.js';

export interface WorkbookFile {
  /** Where the uploaded file is; it is only read. */
  readonly path: string;
  /** The name the user gave it, which decides the extension check. */
  readonly fileName: string;
}

// STUB (test commit): the reader is written by the commit that follows.
export function readWorkbook(
  file: WorkbookFile,
  limits: WorkbookLimits,
  cells: LimitCounter,
  signal: AbortSignal,
): Promise<WorkbookModel> {
  Object.assign({}, limits, cells, signal);
  return Promise.resolve({
    fileName: file.fileName.slice(0, 0),
    date1904: false,
    sheets: [],
    definedNames: [],
    externalLinks: [],
    connections: [],
    hasMacros: false,
    sharedStringCount: 0,
  });
}
