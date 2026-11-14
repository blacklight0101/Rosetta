import { z } from 'zod';
import { keyOf, mergeDrafts } from '../../agent/answer-collector.js';
import { searchJson } from '../../cards/extract-json.js';
import { parseCardsLenient, type ParseOptions } from '../../cards/parse-cards.js';
import type { TargetOutcome } from '../lab-target.js';

// RF-1406, RF-208, P10-07: the lab's check of a card repair answer the card parser reads with no
// problem. Its cards are merged into the readable cards of the earlier answer with the run's own
// `mergeDrafts`, as the run does after a repair (`answer-collector.ts`). `Fixed`: every card the
// earlier answer wrote is in the merged cards with at least as many claims as it wrote (a faulty
// claim counts, as the repair was asked to write it again); `Dropped` (not usable): a run keeps a
// card without the claim the repair was asked to fix and, the merged answer having no problem,
// sends no second repair. `second repair` is the follow-up of a `Partial`, `Unusable` or `ReadsMore`
// answer (RF-1403).

const written = z.object({
  cards: z.array(
    z.object({ type: z.string(), title: z.string(), claims: z.array(z.unknown()) }).loose(),
  ),
});

/** The cards the earlier answer wrote, with the claims it wrote for each, readable or not. */
function writtenCards(answer: string, options: ParseOptions) {
  for (const value of searchJson(answer).values) {
    const parsed = written.safeParse(value);
    if (parsed.success) {
      return parsed.data.cards.map((card) => ({ key: keyOf(card), claims: card.claims.length }));
    }
  }
  const drafts = parseCardsLenient(answer, new Map(), options).drafts;
  return drafts.map((card) => ({ key: keyOf(card), claims: card.claims.length }));
}

const SECOND_REPAIR = new Set(['Partial', 'Unusable', 'ReadsMore']);

/** RF-1406: the outcome of a card repair answer, merged with the earlier answer as a run merges it. */
// RF-1406, RF-1403
export function mergedRepairOutcome(
  outcome: TargetOutcome,
  answers: { readonly earlier: string; readonly repair: string },
  options: ParseOptions,
): TargetOutcome {
  const followUps = { 'second repair': SECOND_REPAIR.has(outcome.detail) };
  if (outcome.detail !== 'Valid') return { ...outcome, followUps };
  const earlier = parseCardsLenient(answers.earlier, new Map(), options).drafts;
  const repaired = parseCardsLenient(answers.repair, new Map(), options).drafts;
  const merged = new Map(mergeDrafts(earlier, repaired).map((card) => [keyOf(card), card]));
  const kept = writtenCards(answers.earlier, options).every(
    (card) => (merged.get(card.key)?.claims.length ?? 0) >= card.claims,
  );
  return kept
    ? { usable: true, detail: 'Fixed', followUps }
    : { usable: false, detail: 'Dropped', followUps };
}
