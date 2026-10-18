import type { CodeMap } from '../../domain/code-map/code-map.js';
import { emptyShapes, type ScanShapes } from '../../domain/planning/scan-shapes.js';
import type { RepositoryReader } from '../ports/repository-reader.js';

// RF-632, DEC-135: skeleton.

export const measureLimitBytes = 8 * 1024 * 1024;

export async function measureScan(
  codeMap: Pick<CodeMap, 'files'>,
  reader: Pick<RepositoryReader, 'readBytes' | 'skippedPaths'>,
): Promise<ScanShapes> {
  await Promise.resolve([codeMap, reader]);
  return emptyShapes;
}
