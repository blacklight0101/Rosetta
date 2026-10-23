import type { CardType, ClaimStatus } from '../cards/card-vocabulary.js';
import type { Citation } from '../cards/citation.js';
import {
  actionClaimTexts,
  detailKindOf,
  type DetailKind,
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

/**
 * What the card's claims say about a text of one kind of detail. A text with a Supported claim is
 * supported. Otherwise, a card that has claims of that kind judged it (unsupported); only a card
 * with none, written before they were claims, leaves it unstated. This is decided per card, not per
 * text: the card writer masks the header and each claim on its own, so a secret-looking value can
 * stop a text matching its claim, and that must never make a rejected item look like an old one.
 */
function judgementOf(
  claims: readonly SourceClaim[],
): (kind: DetailKind | 'action', text: string) => Judgement {
  const supported = new Set(claims.filter(isSupported).map((claim) => claim.text));
  const kinds = new Set(claims.map((claim) => detailKindOf(claim.text)));
  return (kind, text) => {
    if (supported.has(text)) return 'supported';
    return kind !== 'action' && !kinds.has(kind) ? 'unstated' : 'unsupported';
  };
}

/**
 * The screen of a card with only what the verifier supported (RF-626, ADR-005): an action, a
 * field, a role, the route and a link are claims of the card, stated in the texts of
 * `screen-claims.ts`. An action or field with no supported claim is dropped. A card with no claim
 * of a kind at all (written before they were claims) keeps its route, roles and links as before and
 * keeps its fields apart as unchecked; a card that has claims of the kind keeps only the items a
 * Supported claim states.
 */
function supportedScreen(card: SourceCard, all: readonly SourceClaim[]): { screen?: SourceScreen } {
  const { screen } = card;
  if (screen === undefined) return {};
  const judge = judgementOf(all);
  const kept = (kind: DetailKind, text: string): boolean => judge(kind, text) !== 'unsupported';
  const fields = screen.fields.map((field) => ({
    field,
    judged: judge('field', fieldClaimText(field)),
  }));
  const actions = screen.actions.filter((action) =>
    actionClaimTexts(screen.actions, action).some((text) => judge('action', text) === 'supported'),
  );
  return {
    screen: {
      ...screen,
      route: kept('route', routeClaimText(screen.route)) ? screen.route : '',
      roles: screen.roles.filter((role) => kept('role', roleClaimText(role))),
      leadsTo: screen.leadsTo.filter((target) => kept('leadsTo', leadsToClaimText(target))),
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

/** RF-604, P3-121: what a source run that stopped at a cap left unjudged, for the package to say. */
export interface SourceStop {
  /** The claims the verifier never judged (`Unverified` or `Proposed`); they are excluded. */
  readonly unjudgedClaims: number;
  readonly totalClaims: number;
}

/** RF-604, P3-121: the stop of a source run that ended `CapReached`; undefined for any other end. */
export function sourceStopOf(
  endState: string | null,
  cards: readonly SourceCard[],
): SourceStop | undefined {
  if (endState !== 'CapReached') return undefined;
  const claims = cards.flatMap((card) => card.claims);
  const unjudged = claims.filter((c) => c.status === 'Unverified' || c.status === 'Proposed');
  return { unjudgedClaims: unjudged.length, totalClaims: claims.length };
}
