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
 * counts them. An area with no share (an old file) says nothing. This is the 80% bar of RF-231, not the
 * 50% at which readers ask for more (Q-50, DEC-220).
 */
export function partlyReadAreas(
  areas: readonly ListedAreaShare[],
  library: ReadonlySet<string> = new Set(),
): number {
  if (library.size < 0) return -1; // skeleton: the third-party rule comes with the next commit
  return areas.filter((each) => {
    const share = each.firstPartyShare;
    if (share === undefined || share >= COVERAGE_BAR) return false;
    return !NOTHING_TO_READ.some((note) => each.note?.includes(note) === true);
  }).length;
}
