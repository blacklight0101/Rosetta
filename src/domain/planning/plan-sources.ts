import type { CardType, ClaimStatus } from '../cards/card-vocabulary.js';
import type { Citation } from '../cards/citation.js';
import { actionClaimText } from '../cards/screen-claims.js';

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

interface SourceField {
  readonly name: string;
  readonly inputKind: string;
  readonly required: boolean;
}

/** What a `SCRN` card says about its screen, as the plan needs it (RF-626); the validations stay in the card. */
interface SourceScreen {
  /** The route or page name. */
  readonly route: string;
  readonly roles: readonly string[];
  readonly fields: readonly SourceField[];
  /**
   * `supportedCards` only: the fields no claim of the card states (an old card whose header holds
   * them unchecked). They are drawn marked "not checked" and never sent to the planner.
   */
  readonly uncheckedFields?: readonly SourceField[] | undefined;
  /** `supportedCards` only: how many fields the verifier did not support. */
  readonly unsupportedFields?: number | undefined;
  readonly actions: readonly {
    readonly label: string;
    readonly handler?: string | undefined;
    readonly flow?: string | undefined;
  }[];
  /** The screens it leads to: `SCRN` card ids or routes. */
  readonly leadsTo: readonly string[];
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
  /** `SCRN` cards only: the screen's route, roles, fields, actions and where it leads (RF-261). */
  readonly screen?: SourceScreen | undefined;
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

/**
 * The screen of a card with only the actions whose claim is `Supported` (RF-626, ADR-005): an
 * action is a claim of its card, stated in the text `actionClaimText` gives.
 */
function supportedScreen(
  card: SourceCard,
  supported: readonly SourceClaim[],
): { screen?: SourceScreen } {
  if (card.screen === undefined) return {};
  const stated = new Set(supported.map((claim) => claim.text));
  const actions = card.screen.actions.filter((action) => stated.has(actionClaimText(action)));
  return { screen: { ...card.screen, actions } };
}

/** The cards with their `Supported` claims only, in card order; a card without one is left out. */
// RF-604
export function supportedCards(cards: readonly SourceCard[]): SourceCard[] {
  return cards.flatMap((card) => {
    const claims = card.claims.filter(isSupported);
    return claims.length === 0 ? [] : [{ ...card, claims, ...supportedScreen(card, claims) }];
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
