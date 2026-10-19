import { workbookDuplicateName, workbookTooManyFiles } from './workbook-errors.js';

/**
 * RF-151: judges the file names of one upload before any is opened: no more than `maxFiles`
 * (RST-1924), and no two names equal when case is ignored (RST-1928).
 */
export function checkWorkbookBatch(fileNames: readonly string[], maxFiles: number): void {
  if (fileNames.length > maxFiles) throw workbookTooManyFiles(maxFiles);
  const seen = new Set<string>();
  for (const name of fileNames) {
    const key = name.toLowerCase();
    if (seen.has(key)) throw workbookDuplicateName(name);
    seen.add(key);
  }
}
