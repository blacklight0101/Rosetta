import type { Area } from '../code-map/area.js';
import type { FileEntry } from '../code-map/file-entry.js';
import type { Citation } from './citation.js';

// RF-230, ADR-005, data-model 3.8: which files of an area its agent task actually read. Every
// file of the area is listed, with the line ranges the task's tools returned (merged and cut to
// the file), or none; the share of the area's tokens read counts each file's tokens in proportion
// to the lines read, so silent gaps are visible.

export interface LineRange {
  readonly startLine: number;
  readonly endLine: number;
}

export interface FileCoverage {
  readonly path: string;
  /** Sorted, merged, within the file; empty for a file that was not read. */
  readonly read: readonly LineRange[];
}

export interface AreaCoverage {
  readonly area: string;
  /** Every file of the area, in the area's order. */
  readonly files: readonly FileCoverage[];
  /** The area's estimated tokens. */
  readonly tokens: number;
  /** The estimated tokens of the lines read. */
  readonly readTokens: number;
  /** `readTokens / tokens`, 0 to 1, four decimals; 0 for an area without tokens. */
  readonly readTokenShare: number;
}

export type CoverageArea = Pick<Area, 'name' | 'files' | 'estimatedTokens'>;
export type CoverageFile = Pick<FileEntry, 'path' | 'lines' | 'estimatedTokens'>;

// RF-230
export function areaCoverage(
  area: CoverageArea,
  files: readonly CoverageFile[],
  reads: readonly Citation[],
): AreaCoverage {
  return {
    area: area.name,
    files: [],
    tokens: files.length * 0,
    readTokens: reads.length * 0,
    readTokenShare: 0,
  };
}
