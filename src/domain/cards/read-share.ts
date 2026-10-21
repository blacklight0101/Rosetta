import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { FileEntry } from '../code-map/file-entry.js';
import { isThirdPartyFile } from '../code-map/third-party.js';
import type { Citation } from './citation.js';
import { mergedRanges, tokensRead } from './area-coverage.js';

// Q-50, RF-206, RF-231: how much of the first-party code of an area has been read while its agent
// still works, and which files it has not touched yet, in the order worth reading them. The share
// counts tokens like the area coverage does (lines read over lines of the file); a file the scan
// marks third-party (RF-104) or skipped is in no number.

export interface ReadShare {
  /** The estimated first-party tokens of the area. */
  readonly tokens: number;
  /** The estimated first-party tokens of the lines read. */
  readonly readTokens: number;
  /** `readTokens / tokens`, 0 to 1; 1 for an area without first-party tokens (nothing to read). */
  readonly share: number;
  /** First-party files with no line read: formulas, then macros, then the largest first. */
  readonly unread: readonly FileEntry[];
}

/** Workbook files that carry the behaviour: every `formulas.md`, then the modules under `macros/`. */
function rankOf(path: string): number {
  const segments = path.split('/');
  if (segments.at(-1) === 'formulas.md') return 0;
  return segments.slice(0, -1).includes('macros') ? 1 : 2;
}

function byWorth(left: FileEntry, right: FileEntry): number {
  return (
    rankOf(left.path) - rankOf(right.path) ||
    right.estimatedTokens - left.estimatedTokens ||
    byCodeUnit(left.path, right.path)
  );
}

// Q-50
export function readShare(files: readonly FileEntry[], reads: readonly Citation[]): ReadShare {
  const own = files.filter((file) => file.estimatedTokens > 0 && !isThirdPartyFile(file));
  const readOf = (file: FileEntry) =>
    mergedRanges(
      reads.filter((each) => each.path === file.path),
      file.lines,
    );
  const tokens = own.reduce((sum, file) => sum + file.estimatedTokens, 0);
  const readTokens = own.reduce((sum, file) => sum + tokensRead(file, readOf(file)), 0);
  const unread = own.filter((file) => readOf(file).length === 0).sort(byWorth);
  return { tokens, readTokens, share: tokens === 0 ? 1 : Math.min(1, readTokens / tokens), unread };
}
