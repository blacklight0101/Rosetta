// RF-230, RF-231, DEC-220 (P8-130): the areas of a run read below the coverage bar.

/** RF-231: the share of an area's first-party tokens from which it counts as read. */
export const COVERAGE_BAR = 0.8;

export interface ListedAreaShare {
  readonly area: string;
  readonly firstPartyShare?: number | undefined;
  readonly note?: string | undefined;
}

/** Areas with nothing a reader could read are no part of the count (RF-243, RF-206). */
const NOTHING_TO_READ = ['no application logic', 'no readable file'];

/**
 * RF-230: how many areas of own code were read below the coverage bar, counted the way the run page
 * counts them: an area the code map calls third-party (`library`) is no part of the count. An area with no share (an old file, or the restored part of a resumed one) makes the whole listing say nothing. This is the 80% bar of RF-231, not the
 * 50% at which readers ask for more (Q-50, DEC-220).
 */
export function partlyReadAreas(
  areas: readonly ListedAreaShare[],
  library: ReadonlySet<string> = new Set(),
): number {
  const counted = areas.filter(
    (each) =>
      !library.has(each.area) &&
      !NOTHING_TO_READ.some((note) => each.note?.includes(note) === true),
  );
  // RF-006 (P8-138): a resumed run of an older deploy restores areas with no share; it says nothing.
  if (counted.some((each) => each.firstPartyShare === undefined)) return 0;
  return counted.filter((each) => (each.firstPartyShare ?? 1) < COVERAGE_BAR).length;
}
