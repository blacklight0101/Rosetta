// RF-264: when a run has too few cards to explain the application. The rules are plain numbers so
// the owner can see why an overview was called thin.

/** Fewer eligible cards than this: the summariser is not asked, the overview says it cannot explain. */
export const MIN_CARDS_FOR_OVERVIEW = 3;

export interface RunReach {
  /** Cards that passed the citation check (open questions left out). */
  readonly cards: number;
  /** Areas of the code map the run could have explained. */
  readonly areas: number;
  /** Areas that gave at least one such card. */
  readonly areasWithCards: number;
  /** Areas that are third-party code. */
  readonly thirdPartyAreas: number;
}

/** Whether the run has too few cards, or cards from too few of its areas, to explain the application. */
// RF-264
export function isThin(reach: RunReach): boolean {
  return reach.cards < MIN_CARDS_FOR_OVERVIEW || reach.areasWithCards * 2 < reach.areas;
}

const NEXT_STEP =
  'Next step: start a new scan if the repository changed, then run again on more areas of the application code.';

/** The sentence a thin overview opens with: what is missing and what to do next. */
// RF-264
export function thinNotice(reach: RunReach): string {
  const most = reach.areas > 0 && reach.thirdPartyAreas * 2 >= reach.areas;
  const why = most
    ? 'Most areas of this repository hold third-party code, which says nothing about the application.'
    : `Only ${String(reach.cards)} card(s) from ${String(reach.areasWithCards)} of ${String(reach.areas)} area(s) passed the citation check.`;
  return `This run cannot explain the application yet. ${why} ${NEXT_STEP}`;
}
