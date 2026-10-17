import { CLAIM_STATUSES, type ClaimStatus } from './card-vocabulary.js';

// RF-303, ADR-005: the verification summary of a run, claims per status per area and the overall
// supported share. Stub: filled in by the next commit.

/** The claims of one card, per status (a status missing from `counts` is zero). */
export interface CardClaimCounts {
  readonly area: string;
  readonly counts: Readonly<Record<string, number>>;
}

export interface StatusTotals {
  readonly counts: Readonly<Record<ClaimStatus, number>>;
  readonly total: number;
  readonly supportedShare: number | null;
}

export interface AreaVerification extends StatusTotals {
  readonly area: string;
}

export interface VerificationSummary {
  readonly areas: readonly AreaVerification[];
  readonly overall: StatusTotals;
}

const none = Object.fromEntries(CLAIM_STATUSES.map((status) => [status, 0])) as Record<
  ClaimStatus,
  number
>;

export function summariseVerification(cards: readonly CardClaimCounts[]): VerificationSummary {
  return { areas: [], overall: { counts: none, total: cards.length * 0, supportedShare: null } };
}

export function formatShare(share: number | null): string {
  return String(share).slice(0, 0);
}
