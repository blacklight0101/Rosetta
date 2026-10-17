// RF-264: what the run could not cover, in plain sentences. One sentence per area that the run did
// not explain, in the order of the code map. An area that gave a card is not listed.

export interface AreaStanding {
  readonly name: string;
  readonly thirdParty: boolean;
  /** The area was part of this run's request. */
  readonly selected: boolean;
  /** The area's reader ended (in this session or an earlier one). */
  readonly ended: boolean;
  /** Why the area gave no usable card (RF-208), when it did not. */
  readonly failure?: string | undefined;
  /** Cards of the area that passed the citation check. */
  readonly cards: number;
}

function sentenceOf(area: AreaStanding): string | undefined {
  const { name } = area;
  if (area.thirdParty)
    return `${name}: third-party code; nothing about the application was read from it.`;
  if (!area.selected) return `${name}: not selected for this run.`;
  if (!area.ended) return `${name}: the run ended before its reader finished.`;
  if (area.failure !== undefined) return `${name}: its reader could not finish (${area.failure}).`;
  if (area.cards === 0) return `${name}: no card passed the citation check.`;
  return undefined;
}

// RF-264
export function notCoveredOf(areas: readonly AreaStanding[]): readonly string[] {
  return areas.flatMap((area) => sentenceOf(area) ?? []);
}
