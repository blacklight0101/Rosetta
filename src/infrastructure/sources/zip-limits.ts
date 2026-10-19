// RF-127, RF-129: the limits of the zip extractor; the upload size limit belongs to the request (RF-128).

export interface ZipExtractionLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
  /** The most an entry may expand to for each byte it takes in the archive. */
  readonly maxRatio: number;
}

/** RF-129, DEC-151: the per-entry ratio is judged only for entries above 4 MiB. */
export const RATIO_ENTRY_FLOOR_BYTES = 4 * 1024 * 1024;

/** RF-129, DEC-151: the archive-wide ratio is judged only when the total unpacked size is above 64 MiB. */
export const RATIO_ARCHIVE_FLOOR_BYTES = 64 * 1024 * 1024;

/** RF-127, RF-129 defaults: 100,000 entries, 500 MB unpacked, 200 to 1 per entry. */
export const DEFAULT_ZIP_LIMITS: ZipExtractionLimits = {
  maxEntries: 100_000,
  maxBytes: 500 * 1024 * 1024,
  maxRatio: 200,
};
