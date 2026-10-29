import type { DraftTable, MergedTable } from './data-model.js';

// P7-13 stub: the tables of the draft with those whose names differ only by plural, case or
// separators merged into the first of them.

export function mergedDrafts(drafts: readonly DraftTable[]): {
  readonly tables: DraftTable[];
  readonly merges: MergedTable[];
} {
  return { tables: [...drafts], merges: [] };
}
