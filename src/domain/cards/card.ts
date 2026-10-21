import { err, ok, type Result } from '../errors/result.js';
import type { CardType, ClaimStatus, Confidence, OpenQuestionState } from './card-vocabulary.js';
import type { Citation } from './citation.js';
import { canTransitionClaim } from './claim-transitions.js';
import {
  flowFields,
  screenFields,
  stepFields,
  type Branch,
  type CitedText,
  type DetailProblem,
  type FlowDetail,
  type ScreenDetail,
} from './flow-screen.js';
import { screenClaims } from './screen-claims.js';

// Architecture section 5, ADR-005: a card holds claims; a claim holds citations and a status that
// changes only through the transitions; nothing is ever removed (RF-302).

/** What the verifier decided about a claim (data-model 3.7). */
export interface ClaimVerdict {
  readonly step: 'citation' | 'judgement';
  readonly reason: string;
  readonly model: string;
  /** ISO 8601 instant from the Clock port. */
  readonly at: string;
}

export interface Claim {
  /** `<card id>.c<n>`. */
  readonly claimId: string;
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly status: ClaimStatus;
  readonly verdict?: ClaimVerdict;
  /** `FLOW` steps only: the `SCRN`, `BR`, `ENT` or `INT` card id the step touches (RF-260). */
  readonly target?: string;
  /** `FLOW` steps only: the error or alternative paths of the step (RF-260). */
  readonly branches?: readonly Branch[];
  /** RF-209, RF-302: the id of the rejected claim a Deepen re-read answers; that claim is kept. */
  readonly replaces?: string;
}

export interface Card {
  readonly id: string;
  readonly type: CardType;
  readonly title: string;
  readonly summary: string;
  readonly area: string;
  readonly agentTaskId: string;
  readonly confidence: Confidence;
  readonly claims: readonly Claim[];
  /** `OQ` cards only. */
  readonly question?: string;
  readonly whyItMatters?: string;
  readonly questionState?: OpenQuestionState;
  readonly mergedFrom?: readonly string[];
  /** The areas of the merged cards, in card order, when the card is a merge (RF-250). */
  readonly mergedAreas?: readonly string[];
  /** `FLOW` cards only (RF-260). */
  readonly flow?: FlowDetail;
  /** `SCRN` cards only (RF-261). */
  readonly screen?: ScreenDetail;
  /** RF-206: why the card should be read with care, for example it was written without reading. */
  readonly note?: string;
}

export interface ClaimInput {
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly target?: string | undefined;
  readonly branches?: readonly CitedText[] | undefined;
  /** RF-209: the rejected claim this one answers; kept only when the task was given that claim. */
  readonly replaces?: string | undefined;
}

export interface CardInput {
  readonly id: string;
  readonly type: CardType;
  readonly title: string;
  readonly summary: string;
  readonly area: string;
  readonly agentTaskId: string;
  readonly confidence: Confidence;
  readonly claims: readonly ClaimInput[];
  readonly question?: string | undefined;
  readonly whyItMatters?: string | undefined;
  readonly flow?: FlowDetail | undefined;
  readonly screen?: ScreenDetail | undefined;
  readonly note?: string | undefined;
}

export type CardProblem =
  'no-claims' | 'claim-without-citation' | 'question-missing' | DetailProblem;
export type ClaimTransitionProblem = 'claim-not-found' | 'transition-not-allowed';

type QuestionFields = Pick<Card, 'question' | 'whyItMatters' | 'questionState'>;

function questionFields(input: CardInput): Result<QuestionFields, CardProblem> {
  if (input.type !== 'OQ') return ok({});
  if (!input.question || !input.whyItMatters) return err('question-missing');
  return ok({
    question: input.question,
    whyItMatters: input.whyItMatters,
    questionState: 'Open',
  });
}

/** The `Proposed` claim number `number` of card `id`, as the agent wrote it. */
function claimFrom(
  card: Pick<Card, 'id' | 'type'>,
  number: number,
  claim: ClaimInput,
): Result<Claim, CardProblem> {
  const step = stepFields(card.type, claim);
  if (!step.ok) return step;
  return ok({
    claimId: `${card.id}.c${String(number)}`,
    text: claim.text,
    citations: claim.citations,
    status: 'Proposed',
    ...step.value,
    ...(claim.replaces === undefined ? {} : { replaces: claim.replaces }),
  });
}

function claimsOf(input: CardInput): Result<readonly Claim[], CardProblem> {
  const claims: Claim[] = [];
  // RF-261: the validations and actions of a screen are claims after the ones the agent wrote.
  const derived: readonly ClaimInput[] =
    input.type === 'SCRN' && input.screen ? screenClaims(input.screen, input.claims) : [];
  for (const [index, claim] of [...input.claims, ...derived].entries()) {
    const made = claimFrom(input, index + 1, claim);
    if (!made.ok) return made;
    claims.push(made.value);
  }
  return ok(claims);
}

/**
 * RF-209, DEC-158: the card with these claims after its own, as `Proposed` claims numbered on from
 * its last. The card keeps its id and everything else; no claim of it changes.
 */
export function appendClaims(card: Card, inputs: readonly ClaimInput[]): Result<Card, CardProblem> {
  if (inputs.some((claim) => claim.citations.length === 0)) return err('claim-without-citation');
  const added: Claim[] = [];
  for (const [index, input] of inputs.entries()) {
    const made = claimFrom(card, card.claims.length + index + 1, input);
    if (!made.ok) return made;
    added.push(made.value);
  }
  return ok({ ...card, claims: [...card.claims, ...added] });
}

// RF-202: at least one claim, each with at least one citation; an OQ also has its question; a FLOW
// its trigger and outcome and cited branches (RF-260); a SCRN its cited validations (RF-261).
export function createCard(input: CardInput): Result<Card, CardProblem> {
  if (input.claims.length === 0) return err('no-claims');
  if (input.claims.some((claim) => claim.citations.length === 0)) {
    return err('claim-without-citation');
  }
  const question = questionFields(input);
  if (!question.ok) return question;
  const flow = flowFields(input.type, input.flow);
  if (!flow.ok) return flow;
  const screen = screenFields(input.type, input.screen);
  if (!screen.ok) return screen;
  const claims = claimsOf(input);
  if (!claims.ok) return claims;
  return ok({
    id: input.id,
    type: input.type,
    title: input.title,
    summary: input.summary,
    area: input.area,
    agentTaskId: input.agentTaskId,
    confidence: input.confidence,
    claims: claims.value,
    ...question.value,
    ...flow.value,
    ...screen.value,
    ...(input.note === undefined ? {} : { note: input.note }),
  });
}

/** A new card whose claim has the new status and verdict; the claim stays in the card (RF-302). */
export function transitionClaim(
  card: Card,
  claimId: string,
  to: ClaimStatus,
  verdict: ClaimVerdict,
): Result<Card, ClaimTransitionProblem> {
  const claim = card.claims.find((candidate) => candidate.claimId === claimId);
  if (claim === undefined) return err('claim-not-found');
  if (!canTransitionClaim(claim.status, to)) return err('transition-not-allowed');
  const claims = card.claims.map((candidate) =>
    candidate.claimId === claimId ? { ...candidate, status: to, verdict } : candidate,
  );
  return ok({ ...card, claims });
}

/** Claims per status, every status present (RF-303, data-model 3.7 index). */
export function countClaims(card: Card): Readonly<Record<ClaimStatus, number>> {
  const count = (status: ClaimStatus): number =>
    card.claims.filter((claim) => claim.status === status).length;
  return {
    Proposed: count('Proposed'),
    CitationInvalid: count('CitationInvalid'),
    Supported: count('Supported'),
    Rejected: count('Rejected'),
    Unverified: count('Unverified'),
  };
}
