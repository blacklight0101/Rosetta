import { mergedRanges, type LineRange } from './area-coverage.js';

// RF-208, RF-209, RST-1303: which files of an area a task did not read in full. A file is read in
// full when the lines it read, merged, cover the file from the first line to the last; a file
// opened only in part is still to be read. Empty files have nothing to read.

/** The paths, in the given order, of the files not read from their first line to their last. */
export function filesNotReadInFull(
  paths: readonly string[],
  files: readonly { readonly path: string; readonly lines: number }[],
  readOf: (path: string) => readonly LineRange[],
): readonly string[] {
  const lines = new Map(files.map((file) => [file.path, file.lines]));
  return paths.filter((path) => {
    const total = lines.get(path) ?? 0;
    if (total === 0) return false;
    const [first, ...rest] = mergedRanges(readOf(path), total);
    return first === undefined || rest.length > 0 || first.startLine > 1 || first.endLine < total;
  });
}
