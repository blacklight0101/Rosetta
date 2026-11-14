// RF-1411: the cases that differ from their expected label, counted by pair `expected -> label`,
// so a false "supported" verdict and a false "not supported" one are two figures, not one rate.

const byCodeUnits = (a: string, b: string): number => (a === b ? 0 : a < b ? -1 : 1);

/** The pairs in code-unit order; a case that agreed or has no expected label is in none. */
// RF-1411
export function disagreementsOf(
  cases: readonly { readonly expected: string | null; readonly detail: string }[],
): Record<string, number> {
  const pairs = cases.flatMap((each) =>
    each.expected === null || each.expected === each.detail
      ? []
      : [`${each.expected} -> ${each.detail}`],
  );
  const counts: Record<string, number> = {};
  for (const pair of pairs.sort(byCodeUnits)) counts[pair] = (counts[pair] ?? 0) + 1;
  return counts;
}
