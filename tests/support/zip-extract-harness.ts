import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ZipExtraction } from '../../src/application/ports/zip-extractor.js';
import {
  DEFAULT_ZIP_LIMITS,
  YauzlZipExtractor,
  type ZipExtractionLimits,
} from '../../src/infrastructure/sources/zip-extractor.js';
import { writeZipFile } from './zip-fixtures.js';

/** The folder the extractor writes into, below a test's temporary root. */
export function targetOf(root: string): string {
  return join(root, 'files');
}

/** Writes `bytes` as the uploaded zip and extracts it with the default limits, or the given ones. */
export async function extractZip(
  root: string,
  bytes: Buffer,
  limits: Partial<ZipExtractionLimits> = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<ZipExtraction> {
  const zipPath = await writeZipFile(join(root, 'upload'), 'upload.zip', bytes);
  const extractor = new YauzlZipExtractor({ ...DEFAULT_ZIP_LIMITS, ...limits });
  return extractor.extract(zipPath, targetOf(root), signal);
}

/** True when the destination folder exists, whatever it holds. */
export async function targetExists(root: string): Promise<boolean> {
  try {
    await stat(targetOf(root));
    return true;
  } catch {
    return false;
  }
}
