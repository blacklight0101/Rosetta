import { DEFAULT_ZIP_LIMITS, type ZipExtractionLimits } from '../zip-limits.js';

// RF-151, Q-32: the limits of the workbook reader. The three counts come from the settings
// `ROSETTA_WORKBOOK_MAX_FILES`, `_MAX_SHEETS` and `_MAX_CELLS` (start-up validation in
// infrastructure/config/environment.ts); the rest are fixed by the requirement.

export interface WorkbookLimits {
  readonly maxFiles: number;
  readonly maxSheets: number;
  /** Non-empty cells across the project, and shared strings in one workbook. */
  readonly maxCells: number;
  /** One XML part once inflated (RF-151: 200 MB). */
  readonly maxPartBytes: number;
  /** The zip guards of RF-129 applied to the package. */
  readonly zip: ZipExtractionLimits;
}

const MAX_PART_BYTES = 200 * 1024 * 1024;

export const DEFAULT_WORKBOOK_LIMITS: WorkbookLimits = {
  maxFiles: 20,
  maxSheets: 200,
  maxCells: 2_000_000,
  maxPartBytes: MAX_PART_BYTES,
  zip: DEFAULT_ZIP_LIMITS,
};
