import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { costOf } from '../../../../src/domain/budget/price.js';
import { lookupPrice } from '../../../../src/domain/budget/price-table.js';
import { loadPriceTable } from '../../../../src/infrastructure/budget/price-file.js';

// RF-420, DEC-54, DEC-106: the shipped price table `prices/default-prices.yaml` is dated, in USD,
// prices the recommended hosted model, and Ollama models cost zero.

const shipped = fileURLToPath(new URL('../../../../prices/default-prices.yaml', import.meta.url));

describe('shipped price table', () => {
  it('RF-420 is dated and in USD', async () => {
    const table = await loadPriceTable(shipped);

    expect(table.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(table.currency).toBe('USD');
  });

  it('RF-420 prices the recommended OpenAI model by its alias and dated id (DEC-106)', async () => {
    const table = await loadPriceTable(shipped);

    for (const model of ['gpt-5-nano', 'gpt-5-nano-2025-08-07']) {
      const lookup = lookupPrice(table, [], { provider: 'openai', model, keySource: 'server' });
      expect(lookup.kind).toBe('priced');
    }
  });

  it('RF-420 prices an Ollama model at zero', async () => {
    const table = await loadPriceTable(shipped);
    const lookup = lookupPrice(table, [], {
      provider: 'ollama',
      model: 'gemma4:e4b',
      keySource: 'none',
    });
    const usage = { inputTokens: 5_000, cachedInputTokens: 0, outputTokens: 900 };

    expect(lookup.kind === 'priced' && costOf(lookup.price, usage).micros).toBe(0n);
  });

  it('RF-420 refuses a missing file with RST-1602', async () => {
    await expect(loadPriceTable(`${shipped}.missing`)).rejects.toMatchObject({ code: 'RST-1602' });
  });
});
