import type { Area } from '../code-map/area.js';
import type { AreaMarks } from '../code-map/area-surface.js';
import type { FileEntry } from '../code-map/file-entry.js';
import type { CardType } from './card-vocabulary.js';
import type { Citation } from './citation.js';

// RF-230, ADR-005, data-model 3.8: which files of an area its agent task actually read. Every
// file of the area is listed, with the line ranges the task's tools returned (merged and cut to
// the file), or none; the share of the area's tokens read counts each file's tokens in proportion
// to the lines read, so silent gaps are visible.

export interface LineRange {
  readonly startLine: number;
  readonly endLine: number;
}

interface FileCoverage {
  readonly path: string;
  /** Sorted, merged, within the file; empty for a file that was not read. */
  readonly read: readonly LineRange[];
}

/** RF-260, RF-261, RF-263: what the area gave in flows and screens, next to what the code map marked. */
export interface SurfaceCoverage {
  readonly flowsMarked: boolean;
  readonly screensMarked: boolean;
  readonly flowCards: number;
  readonly screenCards: number;
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
  /** RF-208: why the area's task gave no usable card; left out for an area that gave cards. */
  readonly failure?: string;
  /** RF-260, RF-261: flows and screens; absent from coverage written before they existed. */
  readonly surface?: SurfaceCoverage;
  /** RF-206, RF-243: what to know about the area, for example `not read` or `no application logic`. */
  readonly note?: string;
}

// RF-263
export function surfaceCoverage(
  marks: AreaMarks,
  cards: readonly { readonly type: CardType }[],
): SurfaceCoverage {
  const count = (type: CardType): number => cards.filter((card) => card.type === type).length;
  return {
    flowsMarked: marks.flows,
    screensMarked: marks.screens,
    flowCards: count('FLOW'),
    screenCards: count('SCRN'),
  };
}

export type CoverageArea = Pick<Area, 'name' | 'files' | 'estimatedTokens'>;
export type CoverageFile = Pick<FileEntry, 'path' | 'lines' | 'estimatedTokens'>;

/** The ranges cut to lines 1..`lines`, sorted, with overlapping and adjacent ones merged. */
function mergedRanges(ranges: readonly LineRange[], lines: number): LineRange[] {
  const cut = ranges
    .map((range) => ({
      startLine: Math.max(1, range.startLine),
      endLine: Math.min(lines, range.endLine),
    }))
    .filter((range) => range.startLine <= range.endLine)
    .sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
  const merged: LineRange[] = [];
  for (const range of cut) {
    const last = merged.at(-1);
    if (last !== undefined && range.startLine <= last.endLine + 1) {
      merged[merged.length - 1] = { ...last, endLine: Math.max(last.endLine, range.endLine) };
    } else merged.push(range);
  }
  return merged;
}

function linesIn(ranges: readonly LineRange[]): number {
  return ranges.reduce((sum, range) => sum + range.endLine - range.startLine + 1, 0);
}

/** The file's tokens in proportion to the share of its lines that were read, rounded. */
function tokensRead(file: CoverageFile | undefined, read: readonly LineRange[]): number {
  if (file === undefined || file.lines === 0) return 0;
  return Math.round((file.estimatedTokens * linesIn(read)) / file.lines);
}

function rounded(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// RF-230
export function areaCoverage(
  area: CoverageArea,
  files: readonly CoverageFile[],
  reads: readonly Citation[],
): AreaCoverage {
  const byPath = new Map(files.map((file) => [file.path, file]));
  let readTokens = 0;
  const covered = area.files.map((path): FileCoverage => {
    const file = byPath.get(path);
    const ranges = reads.filter((each) => each.path === path);
    const read = mergedRanges(ranges, file?.lines ?? 0);
    readTokens += tokensRead(file, read);
    return { path, read };
  });
  const tokens = area.estimatedTokens;
  const readTokenShare = tokens === 0 ? 0 : rounded(Math.min(1, readTokens / tokens), 4);
  return {
    area: area.name,
    files: covered,
    tokens,
    readTokens,
    readTokenShare,
  };
}
