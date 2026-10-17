import { CLAIM_STATUSES, type ClaimStatus } from './card-vocabulary.js';

// RF-303, ADR-005: the verification summary of a run: claims per status per area and the overall
// supported share. It is worked out from the claim counts of the cards, so the report (which reads
// `cards/index.json`) and `spec.md` (which holds the cards) give the same numbers. A claim of any
// status counts in the share's divisor, so a run that left claims `Unverified` or `Rejected` does not
// look more reliable than it is.

/** The claims of one card, per status (a status missing from `counts` is zero). */
export interface CardClaimCounts {
  readonly area: string;
  readonly counts: Readonly<Record<string, number>>;
}

export interface StatusTotals {
  readonly counts: Readonly<Record<ClaimStatus, number>>;
  /** Claims of every status. */
  readonly total: number;
  /** `Supported` over `total`, 0..1; null when there are no claims. */
  readonly supportedShare: number | null;
}

interface AreaVerification extends StatusTotals {
  readonly area: string;
}

export interface VerificationSummary {
  /** In order of first appearance among the cards. */
  readonly areas: readonly AreaVerification[];
  readonly overall: StatusTotals;
}

function totalsOf(cards: readonly CardClaimCounts[]): StatusTotals {
  const counts = {
    Proposed: 0,
    CitationInvalid: 0,
    Supported: 0,
    Rejected: 0,
    Unverified: 0,
  };
  for (const card of cards) {
    for (const status of CLAIM_STATUSES) counts[status] += card.counts[status] ?? 0;
  }
  const total = CLAIM_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  return { counts, total, supportedShare: total === 0 ? null : counts.Supported / total };
}

// RF-303
export function summariseVerification(cards: readonly CardClaimCounts[]): VerificationSummary {
  const byArea = new Map<string, CardClaimCounts[]>();
  for (const card of cards) byArea.set(card.area, [...(byArea.get(card.area) ?? []), card]);
  const areas = [...byArea].map(([area, inArea]) => ({ area, ...totalsOf(inArea) }));
  return { areas, overall: totalsOf(cards) };
}

/** `42.9%` with one decimal, or `n/a` when there are no claims. */
export function formatShare(share: number | null): string {
  return share === null ? 'n/a' : `${(share * 100).toFixed(1)}%`;
}
