import type { Card } from './card.js';

// RF-250, ADR-005: stub, replaced by the implementation.

export interface CardMerge {
  readonly ids: readonly string[];
  readonly title: string;
  readonly summary: string;
}

export type MergeProblem =
  | 'too-few-cards'
  | 'unknown-card'
  | 'repeated-card'
  | 'type-differs'
  | 'type-not-mergeable'
  | 'one-area';

export interface MergeResult {
  readonly cards: readonly Card[];
  readonly applied: readonly CardMerge[];
  readonly skipped: readonly { readonly merge: CardMerge; readonly problem: MergeProblem }[];
}

export function applyMerges(cards: readonly Card[], merges: readonly CardMerge[]): MergeResult {
  return {
    cards,
    applied: [],
    skipped: merges.slice(0, 0).map((merge) => ({ merge, problem: 'unknown-card' as const })),
  };
}
