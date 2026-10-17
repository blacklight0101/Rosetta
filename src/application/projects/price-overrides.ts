import type { Price } from '../../domain/budget/price.js';
import type { ProjectSettings } from './project-settings.js';

// RF-1106, DEC-107, data-model.md section 3.1 (`budget.prices`): the project's price overrides as
// prices in bigint micro-dollars, with the entry shape of the price table (data-model.md section
// 3.18), the optional cache-write price included (P2-16). They apply to calls with the user's own
// key only.

/** The overrides of the settings, in their order. */
export function priceOverridesOf(settings: ProjectSettings): readonly Price[] {
  return (settings.budget.prices ?? []).map((price) => {
    const cacheWrite = price.cacheWriteInputPerMillionMicros;
    return {
      provider: price.provider,
      model: price.model,
      inputPerMillionMicros: BigInt(price.inputPerMillionMicros),
      outputPerMillionMicros: BigInt(price.outputPerMillionMicros),
      cachedInputPerMillionMicros: BigInt(price.cachedInputPerMillionMicros),
      // P2-16: an override without a cache-write price has none; the lookup decides (RF-427).
      ...(cacheWrite === undefined ? {} : { cacheWriteInputPerMillionMicros: BigInt(cacheWrite) }),
      currency: 'USD',
    };
  });
}
