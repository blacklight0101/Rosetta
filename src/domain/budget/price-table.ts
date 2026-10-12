import type { Price } from './price.js';

// RF-420, RF-427, DEC-107, data-model.md section 3.18: the shipped price table and how a call finds
// its price. A call with the user's own key takes the project's override first; a call with a
// server key uses only the shipped table (DEC-107). A local model (Ollama, the fake of the tests)
// missing from the table costs zero; any other missing model is unpriced.

export interface PriceTable {
  /** The date the prices were checked, `YYYY-MM-DD`. */
  readonly version: string;
  readonly currency: 'USD';
  readonly prices: readonly Price[];
}

/** Whose key a call uses (RF-1104, data-model.md section 4, `cost_ledger.key_source`). */
export type KeySource = 'user' | 'server' | 'none';

export interface PriceQuery {
  /** The provider kind. */
  readonly provider: string;
  readonly model: string;
  readonly keySource: KeySource;
}

export type PriceLookup =
  | {
      readonly kind: 'priced';
      readonly price: Price;
      /** The table version, with `+project` when a project override priced the call. */
      readonly version: string;
    }
  | { readonly kind: 'unpriced' };

/** The provider kinds that run on this machine and cost nothing (RF-420). */
const localKinds: ReadonlySet<string> = new Set(['ollama', 'fake']);

/** The version recorded for a call priced by a project override. */
const overrideSuffix = '+project';

function freePrice(query: PriceQuery): Price {
  return {
    provider: query.provider,
    model: query.model,
    inputPerMillionMicros: 0n,
    outputPerMillionMicros: 0n,
    cachedInputPerMillionMicros: 0n,
    currency: 'USD',
  };
}

// RF-420, RF-427, RF-1106
export function lookupPrice(
  table: PriceTable,
  overrides: readonly Price[],
  query: PriceQuery,
): PriceLookup {
  const matches = (price: Price): boolean =>
    price.provider === query.provider && price.model === query.model;
  const override = query.keySource === 'user' ? overrides.find(matches) : undefined;
  if (override !== undefined) {
    return { kind: 'priced', price: override, version: table.version + overrideSuffix };
  }
  const shipped = table.prices.find(matches);
  if (shipped !== undefined) return { kind: 'priced', price: shipped, version: table.version };
  if (localKinds.has(query.provider)) {
    return { kind: 'priced', price: freePrice(query), version: table.version };
  }
  return { kind: 'unpriced' };
}
