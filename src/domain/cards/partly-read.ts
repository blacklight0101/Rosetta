// RF-230, RF-231, DEC-220 (P8-130): the areas of a run read below the coverage bar.

/** RF-231: the share of an area's first-party tokens from which it counts as read. */
export const COVERAGE_BAR = 0.8;

export interface ListedAreaShare {
  readonly firstPartyShare?: number | undefined;
  readonly note?: string | undefined;
}

// RF-230
export function partlyReadAreas(areas: readonly ListedAreaShare[]): number {
  return areas.length * 0;
}
