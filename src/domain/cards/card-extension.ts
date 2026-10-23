import { err, ok, type Result } from '../errors/result.js';
import { appendClaims, type Card, type CardProblem, type ClaimInput } from './card.js';
import { extendedCardOf, withAllowedReplaces, type TaskCards } from './card-ids.js';
import { foldInto, restate } from './claim-restated.js';

// RF-209, RF-203, DEC-158, P3-125: the claims a Deepen task adds to cards the parent run holds. A draft
// that names a card the task was given (`extends`) is not a new card (`assignCardIds` leaves it out):
// its claims go on that card, which keeps its id, title, summary and every claim it has; the new
// claims are numbered after the last and wait for the citation check and the judgement like any claim.
// A claim the card already holds in other words (`restate`) is not added again: it gives its citations
// to the claim that stands, or, for a rejected claim, it is the claim that replaces it.

/** A claim a task wrote that stands for one the card already holds (P3-125). */
interface ReplacedClaim {
  readonly agentTaskId: string;
  /** The claim of the card it stands for. */
  readonly claimId: string;
  /** `folded`: same words and lines as a claim that stands; `rejected`: it restates a rejected claim. */
  readonly kind: 'folded' | 'rejected';
}

/** What the extensions changed: the cards that got claims, and the new claims with their task. */
export interface CardExtension {
  readonly cards: readonly Card[];
  readonly claims: readonly { readonly claimId: string; readonly agentTaskId: string }[];
  /** The claims that were folded into one the card holds, or that restate a rejected one (P3-125). */
  readonly replaced: readonly ReplacedClaim[];
}

interface Extended {
  readonly claims: CardExtension['claims'][number][];
  readonly replaced: ReplacedClaim[];
}

/** The card after one claim: added, folded into the claim it repeats, or left out. */
function withClaim(
  card: Card,
  input: ClaimInput,
  agentTaskId: string,
  into: Extended,
): Result<Card, CardProblem> {
  const made = restate(card.claims, input);
  if (made.kind === 'fold') {
    into.replaced.push({ agentTaskId, claimId: made.claimId, kind: 'folded' });
    return ok(foldInto(card, made.claimId, input));
  }
  if (made.kind === 'rejected-again') {
    into.replaced.push({ agentTaskId, claimId: made.claimId, kind: 'rejected' });
    return ok(card);
  }
  const added = appendClaims(card, [made.input]);
  if (!added.ok) return added;
  const claim = added.value.claims[card.claims.length];
  if (claim !== undefined) into.claims.push({ claimId: claim.claimId, agentTaskId });
  if (made.kind === 'replaces-rejected') {
    into.replaced.push({ agentTaskId, claimId: made.claimId, kind: 'rejected' });
  }
  return added;
}

/** Adds the claims of one task's extending drafts to the cards, in draft order. */
function extendedBy(
  task: TaskCards,
  current: Map<string, Card>,
  held: readonly Card[],
): Result<Extended, CardProblem> {
  const into: Extended = { claims: [], replaced: [] };
  for (const draft of task.drafts) {
    const target = extendedCardOf(draft, task, held);
    if (target === undefined) continue;
    let card = current.get(target.id) ?? target;
    for (const claim of draft.claims) {
      const input = withAllowedReplaces(claim, task.replaceable);
      const next = withClaim(card, input, task.agentTaskId, into);
      if (!next.ok) return err(next.error);
      card = next.value;
    }
    current.set(target.id, card);
  }
  return ok(into);
}

/**
 * The cards of `cards` that the tasks' extending drafts add claims to, in card order, and the new
 * claims. Drafts that name no card the task was given are not here: they are new cards.
 */
// RF-209
export function extendCards(
  tasks: readonly TaskCards[],
  cards: readonly Card[],
): Result<CardExtension, CardProblem> {
  const current = new Map<string, Card>();
  const claims: CardExtension['claims'][number][] = [];
  const replaced: ReplacedClaim[] = [];
  for (const task of tasks) {
    const added = extendedBy(task, current, cards);
    if (!added.ok) return err(added.error);
    claims.push(...added.value.claims);
    replaced.push(...added.value.replaced);
  }
  const changed = cards.flatMap((card) => current.get(card.id) ?? []);
  return ok({ cards: changed, claims, replaced });
}
