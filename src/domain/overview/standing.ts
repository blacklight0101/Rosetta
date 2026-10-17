/* eslint-disable @typescript-eslint/no-unused-vars -- red stub, replaced by the implementation in the next commit */
// RF-264: red stub, replaced by the implementation in the next commit.

export interface AreaStanding {
  readonly name: string;
  readonly thirdParty: boolean;
  readonly selected: boolean;
  readonly ended: boolean;
  readonly failure?: string | undefined;
  readonly cards: number;
}

export function notCoveredOf(areas: readonly AreaStanding[]): readonly string[] {
  return [];
}
