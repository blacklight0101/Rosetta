import type { Citation } from '../cards/citation.js';
import type { SourceCard } from './plan-sources.js';

// RF-632, DEC-135: the volumes the cards state for the data. A volume is a supported claim of an
// entity card that gives a quantity: a number next to rows, records, entries, a volume, or a rate
// such as "per day" or "a month". Nothing is estimated: a card that states none gives none.

export interface StatedVolume {
  readonly cardId: string;
  readonly claimId: string;
  readonly text: string;
  readonly citations: readonly Citation[];
}

const UNITS = 'rows?|records?|entries|volume|per (?:day|week|month|year|hour|minute|second)';
const RATE = 'an? (?:day|week|month|year|hour|minute|second)';
const QUANTITY = new RegExp(String.raw`\d[^.\n]*?\b(?:${UNITS}|${RATE})\b`, 'iu');

/** The supported claims of the entity cards that state a quantity of data, in card order. */
// RF-632
export function statedVolumes(sources: readonly SourceCard[]): StatedVolume[] {
  return sources
    .filter((card) => card.type === 'ENT')
    .flatMap((card) =>
      card.claims
        .filter((claim) => claim.status === 'Supported' && QUANTITY.test(claim.text))
        .map(({ claimId, text, citations }) => ({ cardId: card.id, claimId, text, citations })),
    );
}
