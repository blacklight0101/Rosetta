import type { ProviderKind } from '../../application/ports/llm-provider.js';
import { costOf, worstCaseCost, type Price } from '../../domain/budget/price.js';
import { lookupPrice, type KeySource, type PriceTable } from '../../domain/budget/price-table.js';
import type { WorstCase } from '../../domain/budget/usage-cap.js';
import { microUsd } from '../../domain/budget/money.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { CallPricer } from '../providers/call-attempts.js';

// RF-420, RF-427, DEC-107: how the budget guard prices a call before and after it is made, and the
// same prices for the call log of ObservedProvider (so a call has one cost in the ledger and in
// `provider-calls.jsonl`). Server keys use the shipped table only; the user's own key takes the
// project's overrides first. A cloud model without a price is refused (RST-1601) unless it runs on
// the user's own key with `budget.allowUnpriced`: its cost is then unknown and only the token cap
// applies (RF-427).

/** The prices of one run (the shipped table, the project's overrides and its unpriced rule). */
export interface BudgetPricing {
  readonly table: PriceTable;
  readonly overrides: readonly Price[];
  readonly allowUnpriced: boolean;
}

export interface PricingQuery {
  readonly kind: ProviderKind;
  readonly keySource: KeySource;
}

/** A call's price: `price` is undefined for an allowed unpriced model (cost unknown). */
export interface CallPrice {
  readonly price: Price | undefined;
  readonly version: string;
}

// RF-420, RF-427
export function priceCall(pricing: BudgetPricing, query: PricingQuery, model: string): CallPrice {
  const lookup = lookupPrice(pricing.table, pricing.overrides, {
    provider: query.kind,
    model,
    keySource: query.keySource,
  });
  if (lookup.kind === 'priced') return { price: lookup.price, version: lookup.version };
  if (query.keySource === 'user' && pricing.allowUnpriced) {
    return { price: undefined, version: pricing.table.version };
  }
  throw new RosettaError(
    ERROR_CODES.modelUnpriced,
    `The model ${model} of provider kind ${query.kind} has no price in the price table.`,
  );
}

/** The most the call can cost and use; an unknown cost counts only against the token cap. */
// RF-422
export function worstCaseOf(
  price: Price | undefined,
  bound: { readonly promptTokens: number; readonly maxOutputTokens: number },
): WorstCase {
  const micros = price === undefined ? 0n : worstCaseCost(price, bound).micros;
  return { micros, tokens: BigInt(bound.promptTokens) + BigInt(bound.maxOutputTokens) };
}

/** The pricer of ObservedProvider for one provider of a run: the guard's prices, 0 when none. */
// RF-421
export function pricerFor(pricing: BudgetPricing, query: PricingQuery): CallPricer {
  return ({ model, usage }) => {
    const lookup = lookupPrice(pricing.table, pricing.overrides, {
      provider: query.kind,
      model,
      keySource: query.keySource,
    });
    return lookup.kind === 'priced' ? costOf(lookup.price, usage) : microUsd(0n);
  };
}
