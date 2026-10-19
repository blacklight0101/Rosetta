// RF-127, RF-129: the limits of the zip extractor; the upload size limit belongs to the request (RF-128).

export interface ZipExtractionLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
  /** The most an entry may expand to for each byte it takes in the archive. */
  readonly maxRatio: number;
}

/** RF-127, RF-129 defaults: 100,000 entries, 500 MB unpacked, 200 to 1 per entry. */
export const DEFAULT_ZIP_LIMITS: ZipExtractionLimits = {
  maxEntries: 100_000,
  maxBytes: 500 * 1024 * 1024,
  maxRatio: 200,
};
