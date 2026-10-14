import type { GrepResult } from '../../application/ports/repository-reader.js';
import { grepLimits } from './grep-limits.js';
import type { GrepFile } from './grep-runner.js';
import { budgetNotice, cutNotice, matchCapNotice, tooLargeNotice } from './read-refusals.js';

// RF-146, P1-67: the answer of one search, with the notice that tells the agent what it did not
// get (cut lines, files above scan.maxFileBytes, matches past the cap).

export interface SearchedFile extends GrepFile {
  readonly cut: readonly boolean[];
}

export interface SearchedFiles {
  readonly files: readonly SearchedFile[];
  /** Files left out because they are larger than `scan.maxFileBytes`. */
  readonly tooLarge: number;
  /** P1-160: files left out because reading them would pass the search's byte budget. */
  readonly overBudget: number;
  /** The byte budget of the search. */
  readonly budget: number;
}

export function grepResult(
  searched: SearchedFiles,
  matches: readonly { readonly path: string; readonly line: number }[],
): GrepResult {
  const byPath = new Map(searched.files.map((file) => [file.path, file]));
  const found = matches.slice(0, grepLimits.maxMatches).map(({ path, line }) => {
    const file = byPath.get(path);
    return { path, line, text: file?.lines[line - 1] ?? '', cut: file?.cut[line - 1] ?? false };
  });
  const cutLines = searched.files.reduce(
    (total, file) => total + file.cut.filter(Boolean).length,
    0,
  );
  const notices = [
    cutLines > 0 ? cutNotice : '',
    searched.tooLarge > 0 ? tooLargeNotice(searched.tooLarge) : '',
    searched.overBudget > 0 ? budgetNotice(searched.overBudget, searched.budget) : '',
    matches.length > grepLimits.maxMatches ? matchCapNotice : '',
  ].filter((notice) => notice !== '');
  return notices.length === 0
    ? { matches: found, cutLines }
    : { matches: found, cutLines, notice: notices.join(' ') };
}
