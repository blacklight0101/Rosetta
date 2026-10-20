import { DEFAULT_MACRO_LIMITS, type MacroLimits } from './macro-limits.js';
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
  /** One XML text value or attribute, in characters (RST-1926); the parser holds a node whole. */
  readonly maxTextChars: number;
  /** The zip guards of RF-129 applied to the package. */
  readonly zip: ZipExtractionLimits;
  /** The bounds on the VBA project of an `.xlsm` (RF-154). */
  readonly macros: MacroLimits;
  /** The bytes of rendered text of the workbooks in one zip (RST-1926); the renderer's default when absent. */
  readonly maxRenderedBytes?: number;
}

const MAX_PART_BYTES = 200 * 1024 * 1024;
const MAX_TEXT_CHARS = 8 * 1024 * 1024;

export const DEFAULT_WORKBOOK_LIMITS: WorkbookLimits = {
  maxFiles: 20,
  maxSheets: 200,
  maxCells: 2_000_000,
  maxPartBytes: MAX_PART_BYTES,
  maxTextChars: MAX_TEXT_CHARS,
  zip: DEFAULT_ZIP_LIMITS,
  macros: DEFAULT_MACRO_LIMITS,
};
