/* eslint-disable @typescript-eslint/no-unused-vars -- red stub, replaced by the implementation in the next commit */
import type { Card } from '../../domain/cards/card.js';
import type { Overview } from '../../domain/overview/overview.js';
import type { AreaStanding } from '../../domain/overview/standing.js';
import type { ConsolidationParts } from '../consolidate/consolidate-cards.js';

// RF-264: red stub, replaced by the implementation in the next commit.

export type OverviewParts = ConsolidationParts;

export interface OverviewInput {
  readonly cards: readonly Card[];
  readonly areas: readonly AreaStanding[];
}

export function writeOverview(parts: OverviewParts, input: OverviewInput): Promise<Overview> {
  return Promise.resolve({ state: 'unavailable', sections: [], notCovered: [], questions: [] });
}
