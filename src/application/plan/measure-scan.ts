import type { CodeMap } from '../../domain/code-map/code-map.js';
import { measuredFile, type MeasuredFile } from '../../domain/planning/file-facts.js';
import { shapesOf, type ScanShapes } from '../../domain/planning/scan-shapes.js';
import type { RepositoryReader } from '../ports/repository-reader.js';

// RF-632, DEC-135: the shapes of a scan, measured by code. Each file the scan listed is read once,
// through the read-only reader of its snapshot, up to a limit; a larger file gives its size only.
// A file the reader refuses is counted apart. Nothing is written and no model is called.

/** The most bytes of one file the measuring reads (the size of a larger file is still counted). */
export const measureLimitBytes = 8 * 1024 * 1024;

// RF-632
export async function measureScan(
  codeMap: Pick<CodeMap, 'files'>,
  reader: Pick<RepositoryReader, 'readBytes' | 'skippedPaths'>,
): Promise<ScanShapes> {
  const measured: MeasuredFile[] = [];
  let unreadable = 0;
  for (const entry of codeMap.files) {
    const read = await reader.readBytes({ path: entry.path, maxBytes: measureLimitBytes });
    if (!read.ok) unreadable += 1;
    else measured.push(measuredFile(entry, read.value.sizeBytes, read.value.bytes));
  }
  return shapesOf(measured, reader.skippedPaths.invalidNames, unreadable);
}
