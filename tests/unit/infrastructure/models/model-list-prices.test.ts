import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lookupPrice } from '../../../../src/domain/budget/price-table.js';
import { loadPriceTable } from '../../../../src/infrastructure/budget/price-file.js';
import { loadModelList } from '../../../../src/infrastructure/models/model-list-file.js';

// RF-405, Q-56: the shipped model list is dated 2026-10-21, holds the current OpenAI flagships and
// the cheap models, and every model on it has a price in the shipped price table.

const shipped = fileURLToPath(new URL('../../../../prices/models.yaml', import.meta.url));
const prices = fileURLToPath(new URL('../../../../prices/default-prices.yaml', import.meta.url));

describe('the shipped model list and its prices', () => {
  it('RF-405, Q-56 the shipped list is dated 2026-10-21', async () => {
    expect((await loadModelList(shipped)).version).toBe('2026-10-21');
  });

  it('RF-405, Q-56 every model of the shipped list has a price in the price table', async () => {
    const list = await loadModelList(shipped);
    const table = await loadPriceTable(prices);

    for (const entry of list.models) {
      const lookup = lookupPrice(table, [], {
        provider: entry.provider,
        model: entry.model,
        keySource: 'server',
      });
      expect([entry.provider, entry.model, lookup.kind]).toEqual([
        entry.provider,
        entry.model,
        'priced',
      ]);
    }
  });

  it('RF-405, Q-56 the shipped list holds the current OpenAI flagships and the cheap models', async () => {
    const list = await loadModelList(shipped);

    const openai = list.models.filter((entry) => entry.provider === 'openai').map((e) => e.model);
    expect(openai).toEqual(
      expect.arrayContaining([
        'gpt-6-astra',
        'gpt-6.1-sol',
        'gpt-6-sol',
        'gpt-6-luna',
        'gpt-5.6-sol',
        'gpt-5.6-terra',
        'gpt-5.6-luna',
        'gpt-5-nano',
        'gpt-5-mini',
      ]),
    );
  });
});
