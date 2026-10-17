import { describe, expect, it } from 'vitest';
import { priceOverridesOf } from '../../../../src/application/projects/price-overrides.js';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { settingsWith } from '../../../support/project-fixtures.js';

// RF-420, RF-1106, data-model.md sections 3.1 and 3.18, P2-16: a project's price overrides use the
// entry shape of the price table, so an override can carry a cache-write price; without one, an
// override of a provider kind that bills cache writes is handled as a missing price.

const claudeOverride = {
  provider: 'anthropic',
  model: 'claude-test',
  inputPerMillionMicros: 3_000_000,
  outputPerMillionMicros: 15_000_000,
  cachedInputPerMillionMicros: 300_000,
};

function overridesOf(prices: readonly unknown[]) {
  const parsed = parseProjectSettings(settingsWith({ 'budget.prices': prices }));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
  return priceOverridesOf(parsed.value);
}

describe('price overrides: cache-write prices', () => {
  it('RF-420 an override carries its cache-write price in micro-dollars', () => {
    const [price] = overridesOf([
      { ...claudeOverride, cacheWriteInputPerMillionMicros: 3_750_000 },
    ]);

    expect(price?.cacheWriteInputPerMillionMicros).toBe(3_750_000n);
    expect(price?.inputPerMillionMicros).toBe(3_000_000n);
  });

  it('RF-427 an override without a cache-write price has none, never a zero', () => {
    const [price] = overridesOf([claudeOverride]);

    expect(price !== undefined && 'cacheWriteInputPerMillionMicros' in price).toBe(false);
  });

  it('RF-002 a negative cache-write price is RST-1003 at its field', () => {
    const parsed = parseProjectSettings(
      settingsWith({
        'budget.prices': [{ ...claudeOverride, cacheWriteInputPerMillionMicros: -1 }],
      }),
    );

    expect(parsed.ok ? [] : parsed.error.map(({ field, code }) => ({ field, code }))).toEqual([
      {
        field: 'budget.prices.0.cacheWriteInputPerMillionMicros',
        code: ERROR_CODES.settingsCapNegative,
      },
    ]);
  });
});
