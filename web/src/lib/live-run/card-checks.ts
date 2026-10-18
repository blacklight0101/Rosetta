import { judgementPending } from './judgement-state.js';
import type { ClaimRow, RunState } from './run-state.js';

// RF-1004, RF-1014, RF-1015: each card of the run with counts of its claims per status. A rejected
// claim is only ever counted as rejected; a citation that failed the check is counted as citation
// invalid. Only the non-zero counts are shown, in the order of CountKind.

export type CountKind =
  'supported' | 'rejected' | 'citation-invalid' | 'unverified' | 'not-judged' | 'waiting';

interface CountPart {
  readonly kind: CountKind;
  readonly count: number;
}

export type CardSummary =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'all-supported' }
  | { readonly kind: 'counts'; readonly parts: readonly CountPart[] };

export interface CardView {
  readonly cardId: string;
  readonly type: string;
  readonly title: string;
  readonly summary: CardSummary;
}

const ORDER: readonly CountKind[] = [
  'supported',
  'rejected',
  'citation-invalid',
  'unverified',
  'not-judged',
  'waiting',
];

/** A claim still waits while its check runs, or while the judgement step is queued or running. */
function kindOf(claim: ClaimRow, pending: boolean): CountKind {
  switch (claim.status) {
    case 'Supported':
      return 'supported';
    case 'Rejected':
      return 'rejected';
    case 'CitationInvalid':
      return 'citation-invalid';
    case 'Unverified':
      return 'unverified';
    case 'Proposed':
      return 'waiting';
    case 'CitationsChecked':
      return pending ? 'waiting' : 'not-judged';
  }
}

// RF-1014
function summaryOf(claims: readonly ClaimRow[], pending: boolean): CardSummary {
  if (claims.length === 0) return { kind: 'waiting' };
  if (claims.every((claim) => claim.status === 'Supported')) return { kind: 'all-supported' };
  const counted = new Map<CountKind, number>();
  for (const claim of claims) {
    const kind = kindOf(claim, pending);
    counted.set(kind, (counted.get(kind) ?? 0) + 1);
  }
  const parts = ORDER.flatMap((kind): readonly CountPart[] => {
    const count = counted.get(kind) ?? 0;
    return count === 0 ? [] : [{ kind, count }];
  });
  return { kind: 'counts', parts };
}

// RF-1014, RF-1015
export function cardViewsOf(state: RunState): readonly CardView[] {
  const pending = judgementPending(state);
  return state.cards.map((card) => ({
    ...card,
    summary: summaryOf(
      state.claims.filter((claim) => claim.cardId === card.cardId),
      pending,
    ),
  }));
}
