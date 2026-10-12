import type { Price } from '../../domain/budget/price.js';
import type { ProjectSettings } from './project-settings.js';

// RF-1106, DEC-107, data-model.md section 3.1 (`budget.prices`): the project's price overrides as
// prices in bigint micro-dollars. They apply to calls with the user's own key only.

/** The overrides of the settings, in their order. */
export function priceOverridesOf(settings: ProjectSettings): readonly Price[] {
  return (settings.budget.prices ?? []).map((price) => ({
    provider: price.provider,
    model: price.model,
    inputPerMillionMicros: BigInt(price.inputPerMillionMicros),
    outputPerMillionMicros: BigInt(price.outputPerMillionMicros),
    cachedInputPerMillionMicros: BigInt(price.cachedInputPerMillionMicros),
    currency: 'USD',
  }));
}
