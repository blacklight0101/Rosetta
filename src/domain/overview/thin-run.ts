// RF-264: when a run has too few cards to explain the application, and how a run of chosen areas
// says how much it read. The rules are plain numbers so the owner can see why an overview was
// called thin.

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
  /** Every area the scan found. */
  readonly found: number;
  /** Areas of the application's own code the run was asked to read. */
  readonly chosen: number;
}

/** The owner chose some areas and left others of the application's own code out. */
// RF-264
export function isChosenRun(reach: RunReach): boolean {
  return reach.chosen > 0 && reach.chosen + reach.thirdPartyAreas < reach.found;
}

/** Whether the run has too few cards, or cards from too few of its areas, to explain the application. */
// RF-264
export function isThin(reach: RunReach): boolean {
  const areas = isChosenRun(reach) ? reach.chosen : reach.areas;
  return reach.cards < MIN_CARDS_FOR_OVERVIEW || reach.areasWithCards * 2 < areas;
}

const NEXT_STEP =
  'Next step: start a new scan if the repository changed, then run again on more areas of the application code.';

/** The sentence a thin overview opens with: what is missing and what to do next. */
// RF-264
export function thinNotice(reach: RunReach): string {
  const chosen = isChosenRun(reach);
  const areas = chosen ? reach.chosen : reach.areas;
  const most = !chosen && areas > 0 && reach.thirdPartyAreas * 2 >= areas;
  const why = most
    ? 'Most areas of this repository hold third-party code, which says nothing about the application.'
    : `Only ${String(reach.cards)} card(s) from ${String(reach.areasWithCards)} of ${String(areas)} area(s) passed the citation check.`;
  return `This run cannot explain the application yet. ${why} ${NEXT_STEP}`;
}

/** The sentence a run of chosen areas opens with: how much was read and that more gives more. */
// RF-264
export function chosenNotice(reach: RunReach): string {
  const read = `Read ${String(reach.areasWithCards)} of ${String(reach.found)} areas the scan found.`;
  return `${read} Reading more areas gives a fuller picture. ${NEXT_STEP}`;
}
