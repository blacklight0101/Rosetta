import { isThirdPartyPath } from '../../domain/code-map/third-party.js';

// RF-146, RF-104, P1-160: the order in which a grep reads its files, so its byte budget goes to
// the repository's own files first: source maps and vendored or minified scripts (the code map's
// third-party rule, by path) come last. The answer keeps the path order.

const SOURCE_MAP = /\.map$/iu;

function rankOf(path: string): number {
  if (SOURCE_MAP.test(path)) return 2;
  return isThirdPartyPath(path) ? 1 : 0;
}

/** The paths in reading order: own files, then third-party scripts, then source maps; stable. */
export function budgetOrder(paths: readonly string[]): string[] {
  return paths
    .map((path, index) => ({ path, index, rank: rankOf(path) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ path }) => path);
}

/** `files` back in the order of `paths`. */
export function inPathOrder<T extends { readonly path: string }>(
  files: readonly T[],
  paths: readonly string[],
): T[] {
  const position = new Map(paths.map((path, index) => [path, index]));
  return [...files].sort((a, b) => (position.get(a.path) ?? 0) - (position.get(b.path) ?? 0));
}
