import type { ProviderKind } from '../../application/ports/llm-provider.js';
import { costOf, worstCaseCost, type Price } from '../../domain/budget/price.js';
import {
  lookupPrice,
  type KeySource,
  type PriceQuery,
  type PriceTable,
} from '../../domain/budget/price-table.js';
import type { WorstCase } from '../../domain/budget/usage-cap.js';
import { microUsd } from '../../domain/budget/money.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { isRemoteOllama } from '../../application/providers/cloud-consent.js';
import type { Spend } from '../../domain/budget/claim-room.js';
import type { LlmRequest } from '../../application/ports/llm-provider.js';
import type { CallPricer } from '../providers/call-attempts.js';
import { estimateInputTokens } from '../providers/usage-estimate.js';

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
  /** P8-04, RF-433: the host of the Ollama server; one that is not this machine is priced like a cloud provider. */
  readonly ollamaHost?: string | undefined;
  /** RF-143: the run's consent; without it a remote Ollama is refused by the egress guard first (RST-1515). */
  readonly cloudConsent?: boolean | undefined;
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

/**
 * RF-427, P2-24: the message for an own-key override the lookup skipped because it has no
 * cache-write price, so the error names the override; undefined when no such override exists.
 */
export function incompleteOverrideMessage(
  pricing: BudgetPricing,
  query: PricingQuery,
  model: string,
): string | undefined {
  if (query.keySource !== 'user') return undefined;
  const found = pricing.overrides.some(
    (price) =>
      price.provider === query.kind &&
      price.model === model &&
      price.cacheWriteInputPerMillionMicros === undefined,
  );
  if (!found) return undefined;
  return `The price override for model ${model} of provider kind ${query.kind} has no cache-write price, so it is ignored.`;
}

/** RF-433: the price query of a call; an Ollama server that is not this machine is not free. */
function lookupQueryOf(pricing: BudgetPricing, query: PricingQuery, model: string): PriceQuery {
  return {
    provider: query.kind,
    model,
    keySource: query.keySource,
    remote: isRemoteOllama(query.kind, pricing.ollamaHost),
  };
}

function unpricedMessage(pricing: BudgetPricing, query: PricingQuery, model: string): string {
  if (isRemoteOllama(query.kind, pricing.ollamaHost)) {
    return `The Ollama server is not on this machine, so the model ${model} is priced like a cloud model, and it has no price in the price table.`;
  }
  return `The model ${model} of provider kind ${query.kind} has no price in the price table.`;
}

// RF-420, RF-427
export function priceCall(pricing: BudgetPricing, query: PricingQuery, model: string): CallPrice {
  const lookup = lookupPrice(
    pricing.table,
    pricing.overrides,
    lookupQueryOf(pricing, query, model),
  );
  if (lookup.kind === 'priced') return { price: lookup.price, version: lookup.version };
  const awaitsConsent =
    isRemoteOllama(query.kind, pricing.ollamaHost) && pricing.cloudConsent !== true;
  if (awaitsConsent || (query.keySource === 'user' && pricing.allowUnpriced)) {
    return { price: undefined, version: pricing.table.version };
  }
  throw new RosettaError(
    ERROR_CODES.modelUnpriced,
    incompleteOverrideMessage(pricing, query, model) ?? unpricedMessage(pricing, query, model),
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

/**
 * The worst case the budget guard reserves for a request: its prompt, estimated at four characters
 * per token, plus its output limit, priced. A request with no output limit counts none; the guard
 * refuses it before it reserves anything.
 */
// RF-422, P8-132
function worstCaseOfRequest(price: Price | undefined, request: LlmRequest): WorstCase {
  const maxOutputTokens = request.maxOutputTokens ?? 0;
  return worstCaseOf(price, { promptTokens: estimateInputTokens(request), maxOutputTokens });
}

/**
 * P8-132, RF-429: the worst case of each call of a role, as the guard reserves it, for the readers'
 * room to count the calls in flight. A model the guard cannot price is refused here as there.
 */
export function worstCaseOfCalls(
  pricing: BudgetPricing,
  query: PricingQuery,
): (request: LlmRequest) => Spend {
  return (request) => worstCaseOfRequest(priceCall(pricing, query, request.model).price, request);
}

/** The pricer of ObservedProvider for one provider of a run: the guard's prices, 0 when none. */
// RF-421
export function pricerFor(pricing: BudgetPricing, query: PricingQuery): CallPricer {
  return ({ model, usage }) => {
    const lookup = lookupPrice(
      pricing.table,
      pricing.overrides,
      lookupQueryOf(pricing, query, model),
    );
    return lookup.kind === 'priced' ? costOf(lookup.price, usage) : microUsd(0n);
  };
}
