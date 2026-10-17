import type { ReportCard } from '../../application/report/report-model.js';
import { CLAIM_STATUSES } from '../../domain/cards/card-vocabulary.js';
import type { CardClaimCounts } from '../../domain/cards/verification-summary.js';
import { formatUsd, microUsd } from '../../domain/budget/money.js';

// RF-504, RF-506: the words and numbers the report writers share.

export const plural = (n: number, word: string): string =>
  `${String(n)} ${word}${n === 1 ? '' : 's'}`;

/** A cost in micro-dollars (data-model.md section 1). */
export function dollars(micros: number): string {
  return formatUsd(microUsd(BigInt(Math.trunc(micros))));
}

/** A cost in a currency: dollars as in `dollars`, any other currency named before the amount. */
export function moneyText(currency: string, micros: number): string {
  const usd = dollars(micros);
  return currency === 'USD' ? usd : `${currency} ${usd.slice(1)}`;
}

/** The known cost per currency in one phrase: `$1.00`, or `EUR 0.5000 and $1.00`; `$0.0000` for none. */
export function costPhrase(
  cost: readonly { readonly currency: string; readonly costMicros: number }[],
): string {
  if (cost.length === 0) return dollars(0);
  return cost.map((each) => moneyText(each.currency, each.costMicros)).join(' and ');
}

/** `3 calls have no known cost (the model has no price).`; empty when every call has a price (RF-427). */
export function unknownCostText(calls: number): string {
  if (calls === 0) return '';
  return `${calls === 1 ? '1 call has' : `${String(calls)} calls have`} no known cost (the model has no price).`;
}

/** `1 Supported, 2 Rejected`: the statuses with claims, in the order of the vocabulary; `0` for none. */
export function claimsText(counts: Readonly<Record<string, number>>): string {
  const parts = CLAIM_STATUSES.flatMap((status) => {
    const n = counts[status] ?? 0;
    return n > 0 ? [`${String(n)} ${status}`] : [];
  });
  return parts.length === 0 ? '0' : parts.join(', ');
}

/** The claim counts of the cards with their areas, for the verification summary (RF-303). */
export function claimsByArea(cards: readonly ReportCard[]): CardClaimCounts[] {
  return cards.map((card) => ({ area: card.area, counts: card.claimCounts }));
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
