import { z } from 'zod';
import { judgementKinds } from '../../domain/planning/claim-judgement.js';
import type { PlanDraft } from '../../domain/planning/plan-draft.js';

// P5-41, RF-631, ADR-013: the items of the planner's answer that judge a claim (`claimJudgements`) or say
// that an acceptance criterion contradicts a claim a card keeps (`contradicts`). Both are untrusted
// model output: bounded texts and positions; which claim ids and decisions are real is decided by the
// domain (claim-judgement.ts, behaviours-to-keep.ts), not here.

const position = z.number().int().min(1).max(200);
const claimId = z.string().trim().min(1).max(60);

/** A criterion (position in the card's Done-when items) that contradicts a claim. */
export const contradictionItem = z.object({ criterion: position, claim: claimId });

export const judgementItem = z.object({
  claim: claimId,
  judgement: z.enum(judgementKinds),
  decision: position.nullable().default(null),
  answer: z.string().trim().max(40).nullable().default(null),
  reason: z.string().trim().max(2000).default(''),
  security: z.boolean().catch(false).default(false),
});

/** The judgements as drafts; a decision position follows the decisions that were kept. */
export function judgementDrafts(
  items: readonly z.infer<typeof judgementItem>[],
  decisionAt: (position: number) => number | undefined,
): Pick<PlanDraft, 'claimJudgements'> {
  if (items.length === 0) return {};
  return {
    claimJudgements: items.map((each) => ({
      ...each,
      decision: each.decision === null ? null : (decisionAt(each.decision) ?? null),
    })),
  };
}
