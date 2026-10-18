import type { CardType, ClaimStatus } from '../cards/card-vocabulary.js';
import type { Citation } from '../cards/citation.js';
import {
  actionClaimText,
  fieldClaimText,
  leadsToClaimText,
  roleClaimText,
  routeClaimText,
} from '../cards/screen-claims.js';

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

type Judgement = 'supported' | 'unsupported' | 'unstated';

/** What the card's claims say about a text: supported, judged otherwise, or never stated. */
function judgementOf(claims: readonly SourceClaim[]): (text: string) => Judgement {
  const byText = new Map<string, Judgement>();
  for (const claim of claims) {
    if (byText.get(claim.text) === 'supported') continue;
    byText.set(claim.text, isSupported(claim) ? 'supported' : 'unsupported');
  }
  return (text) => byText.get(text) ?? 'unstated';
}

/**
 * The screen of a card with only what the verifier supported (RF-626, ADR-005): an action, a
 * field, a role, the route and a link are claims of the card, stated in the texts of
 * `screen-claims.ts`. An action or field with no supported claim is dropped; a field no claim
 * states at all (a card written before they were claims) is kept apart as unchecked; a role, a
 * link or the route is dropped only when its claim was judged and not supported, so an old card
 * keeps them as before.
 */
function supportedScreen(card: SourceCard, all: readonly SourceClaim[]): { screen?: SourceScreen } {
  const { screen } = card;
  if (screen === undefined) return {};
  const judge = judgementOf(all);
  const kept = (text: string): boolean => judge(text) !== 'unsupported';
  const fields = screen.fields.map((field) => ({ field, judged: judge(fieldClaimText(field)) }));
  const actions = screen.actions.filter((action) => judge(actionClaimText(action)) === 'supported');
  return {
    screen: {
      ...screen,
      route: kept(routeClaimText(screen.route)) ? screen.route : '',
      roles: screen.roles.filter((role) => kept(roleClaimText(role))),
      leadsTo: screen.leadsTo.filter((target) => kept(leadsToClaimText(target))),
      fields: fields.filter(({ judged }) => judged === 'supported').map(({ field }) => field),
      uncheckedFields: fields
        .filter(({ judged }) => judged === 'unstated')
        .map(({ field }) => field),
      unsupportedFields: fields.filter(({ judged }) => judged === 'unsupported').length,
      actions,
    },
  };
}

/** The cards with their `Supported` claims only, in card order; a card without one is left out. */
// RF-604
export function supportedCards(cards: readonly SourceCard[]): SourceCard[] {
  return cards.flatMap((card) => {
    const claims = card.claims.filter(isSupported);
    return claims.length === 0 ? [] : [{ ...card, claims, ...supportedScreen(card, card.claims) }];
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
