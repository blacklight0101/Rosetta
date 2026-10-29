/** What an extraction counted (RF-129, RF-130). */
export interface ZipExtraction {
  /** Files written below the destination. */
  readonly keptFiles: number;
  /** Symbolic link entries, skipped (RF-129). */
  readonly skippedLinks: number;
  /** Files with a name Windows cannot write (a device name, a colon), skipped (RF-122, RF-129). */
  readonly skippedDeviceNames: number;
  /** Files under a `.git`, `node_modules`, `bin` or `obj` folder, left out (RF-129). */
  readonly leftOutEntries: number;
}

// RF-129, RF-130: unpacks an uploaded zip into a destination folder under the limits of
// RF-127 and RF-129 and the single top-level folder rule. Failures are RosettaErrors in the
// RST-19xx range and leave no destination folder behind. The upload use case (RF-128) calls it.
export interface ZipExtractor {
  extract(zipPath: string, targetDir: string, signal: AbortSignal): Promise<ZipExtraction>;
  /**
   * RF-159, DEC-188: whether the files the extraction would keep include a workbook, judged from the
   * central directory alone (nothing is written). The same refusals as `extract` for a zip that
   * cannot be taken.
   */
  holdsWorkbooks(zipPath: string): Promise<boolean>;
}
