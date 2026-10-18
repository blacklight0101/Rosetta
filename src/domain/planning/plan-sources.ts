import type { CardType, ClaimStatus } from '../cards/card-vocabulary.js';
import type { Citation } from '../cards/citation.js';

// RF-604, ADR-005: what `plan` takes from the cards of an understand run. Only claims the verifier
// found `Supported` reach the planner and the package; every other claim (`Rejected`,
// `CitationInvalid`, and `Unverified` or `Proposed`, never judged) is left out and listed as
// excluded with its id, so nothing the code does not support enters the plan and nothing is
// silently dropped. A card with no supported claim is left out whole; its claims are listed.

interface SourceClaim {
  /** `<card id>.c<n>`. */
  readonly claimId: string;
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly status: ClaimStatus;
  /** `FLOW` steps only: the card id the step touches (RF-260). */
  readonly target?: string | undefined;
}

/** A card of the run as its file holds it, with every claim and its status. */
export interface SourceCard {
  readonly id: string;
  readonly type: CardType;
  readonly title: string;
  readonly summary: string;
  readonly area: string;
  readonly claims: readonly SourceClaim[];
  /** `FLOW` cards only: what starts the journey and how it ends (RF-260). */
  readonly flow?: { readonly trigger: string; readonly outcome: string } | undefined;
}

/** A claim the package does not use, named by its id and the status that kept it out. */
export interface ExcludedClaim {
  readonly claimId: string;
  readonly cardId: string;
  readonly status: Exclude<ClaimStatus, 'Supported'>;
}

function isSupported(claim: SourceClaim): boolean {
  return claim.status === 'Supported';
}

/** The cards with their `Supported` claims only, in card order; a card without one is left out. */
// RF-604
export function supportedCards(cards: readonly SourceCard[]): SourceCard[] {
  return cards.flatMap((card) => {
    const claims = card.claims.filter(isSupported);
    return claims.length === 0 ? [] : [{ ...card, claims }];
  });
}

/** Every claim that is not `Supported`, with its card, in card and claim order. */
// RF-604
export function excludedClaims(cards: readonly SourceCard[]): ExcludedClaim[] {
  return cards.flatMap((card) =>
    card.claims.flatMap((claim) =>
      claim.status === 'Supported'
        ? []
        : [{ claimId: claim.claimId, cardId: card.id, status: claim.status }],
    ),
  );
}
