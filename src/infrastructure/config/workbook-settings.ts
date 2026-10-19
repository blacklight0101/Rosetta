import { whole } from './whole-number.js';

// RF-151, Q-32: the three limits of the workbook reader, validated at start-up like
// ROSETTA_UPLOAD_MAX_MB. environment.ts adds the fields to its schema and the settings to the
// Environment.

const DEFAULT_FILES = 20;
const DEFAULT_SHEETS = 200;
const DEFAULT_CELLS = 2_000_000;

export const WORKBOOK_FIELDS = {
  ROSETTA_WORKBOOK_MAX_FILES: whole(
    1,
    100,
    'must be a whole number of workbooks from 1 to 100',
  ).optional(),
  ROSETTA_WORKBOOK_MAX_SHEETS: whole(
    1,
    1000,
    'must be a whole number of sheets from 1 to 1000',
  ).optional(),
  ROSETTA_WORKBOOK_MAX_CELLS: whole(
    1000,
    10_000_000,
    'must be a whole number of cells from 1000 to 10000000',
  ).optional(),
};

export interface WorkbookSettings {
  /** Most workbooks in one upload (RF-151, Q-32). */
  readonly workbookMaxFiles: number;
  /** Most sheets in one workbook (RF-151, Q-32). */
  readonly workbookMaxSheets: number;
  /** Most non-empty cells across the workbooks of a project (RF-151, Q-32). */
  readonly workbookMaxCells: number;
}

export function workbookSettings(parsed: {
  readonly ROSETTA_WORKBOOK_MAX_FILES?: number | undefined;
  readonly ROSETTA_WORKBOOK_MAX_SHEETS?: number | undefined;
  readonly ROSETTA_WORKBOOK_MAX_CELLS?: number | undefined;
}): WorkbookSettings {
  return {
    workbookMaxFiles: parsed.ROSETTA_WORKBOOK_MAX_FILES ?? DEFAULT_FILES,
    workbookMaxSheets: parsed.ROSETTA_WORKBOOK_MAX_SHEETS ?? DEFAULT_SHEETS,
    workbookMaxCells: parsed.ROSETTA_WORKBOOK_MAX_CELLS ?? DEFAULT_CELLS,
  };
}
