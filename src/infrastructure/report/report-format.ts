import { CLAIM_STATUSES } from '../../domain/cards/card-vocabulary.js';
import { formatUsd, microUsd } from '../../domain/budget/money.js';

// RF-504, RF-506: the words and numbers the report writers share.

export const plural = (n: number, word: string): string =>
  `${String(n)} ${word}${n === 1 ? '' : 's'}`;

/** A cost in micro-dollars (data-model.md section 1). */
export function dollars(micros: number): string {
  return formatUsd(microUsd(BigInt(Math.trunc(micros))));
}

/** `1 Supported, 2 Rejected`: the statuses with claims, in the order of the vocabulary; `0` for none. */
export function claimsText(counts: Readonly<Record<string, number>>): string {
  const parts = CLAIM_STATUSES.flatMap((status) => {
    const n = counts[status] ?? 0;
    return n > 0 ? [`${String(n)} ${status}`] : [];
  });
  return parts.length === 0 ? '0' : parts.join(', ');
}

/** The sum of the counts. */
function claimCount(counts: Readonly<Record<string, number>>): number {
  return CLAIM_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

/** `4.0 s`, or `2 min 05.0 s` from one minute on. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)} min ${(seconds - minutes * 60).toFixed(1).padStart(4, '0')} s`;
}

/** `+2.0 s`: the time since the first event. */
export function formatOffset(ms: number): string {
  return `+${formatDuration(ms)}`;
}

/** The summary line of the claims of a card list: `1 card, 1 claim: 1 Supported.` */
export function cardsSummary(cardCount: number, totals: Readonly<Record<string, number>>): string {
  if (cardCount === 0) return 'No cards.';
  const detail = claimsText(totals);
  const claims = plural(claimCount(totals), 'claim');
  return `${plural(cardCount, 'card')}, ${claims}${detail === '0' ? '' : `: ${detail}`}.`;
}

export const COVERAGE_MISSING =
  'Coverage: not available for this run (the coverage report is written by a later release).';
