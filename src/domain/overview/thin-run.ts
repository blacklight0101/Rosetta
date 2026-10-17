/* eslint-disable @typescript-eslint/no-unused-vars -- red stub, replaced by the implementation in the next commit */
// RF-264: red stub, replaced by the implementation in the next commit.

export const MIN_CARDS_FOR_OVERVIEW = 3;

export interface RunReach {
  readonly cards: number;
  readonly areas: number;
  readonly areasWithCards: number;
  readonly thirdPartyAreas: number;
}

export function isThin(reach: RunReach): boolean {
  return false;
}

export function thinNotice(reach: RunReach): string {
  return '';
}
