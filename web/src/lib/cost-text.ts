import type { UsageTotals } from '../api/cost-schemas.js';
import { costText } from '../pages/admin-format.js';
import { tokensLabel } from './live-run/format.js';

// RF-428, RF-1010: how the totals pill and the cost page write a total. Tokens are input plus output
// (cached input is part of the input, as the run token cap counts them); a cost the ledger does not
// know (an unpriced model, RF-427) is named, never shown as zero.

/** The totals of no call: a project that has not run yet. */
export const zeroTotals: UsageTotals = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cost: [],
  unknownCostCalls: 0,
  priceTableVersions: [],
};

export const tokensText = (totals: UsageTotals): string =>
  tokensLabel(totals.inputTokens + totals.outputTokens);

/** The known cost per currency, then the calls whose cost is unknown. */
export function totalCostText(totals: UsageTotals): string {
  const known = costText(totals.cost);
  const unknown = totals.unknownCostCalls;
  if (unknown === 0) return known;
  return `${known} + ${String(unknown)} ${unknown === 1 ? 'call' : 'calls'} unknown`;
}

/** `in 1,200 · out 80 · cached 1,024`. */
export const tokenSplitText = (totals: UsageTotals): string =>
  [
    `in ${tokensLabel(totals.inputTokens)}`,
    `out ${tokensLabel(totals.outputTokens)}`,
    `cached ${tokensLabel(totals.cachedInputTokens)}`,
  ].join(' · ');
