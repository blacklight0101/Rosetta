import type { ZipExtraction, ZipExtractor } from '../../application/ports/zip-extractor.js';

export interface ZipExtractionLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
  readonly maxRatio: number;
}

export const DEFAULT_ZIP_LIMITS: ZipExtractionLimits = {
  maxEntries: 100_000,
  maxBytes: 500 * 1024 * 1024,
  maxRatio: 200,
};

// P3-37 red step: the extractor arrives with the feat commit.
export class YauzlZipExtractor implements ZipExtractor {
  private readonly limits: ZipExtractionLimits;

  constructor(limits: ZipExtractionLimits) {
    this.limits = limits;
  }

  extract(zipPath: string, targetDir: string, signal: AbortSignal): Promise<ZipExtraction> {
    const unused = [this.limits, zipPath, targetDir, signal];
    return Promise.resolve({
      keptFiles: unused.length - 4,
      skippedLinks: 0,
      skippedDeviceNames: 0,
      leftOutEntries: 0,
    });
  }
}
