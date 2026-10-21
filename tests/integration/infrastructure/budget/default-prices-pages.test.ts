import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { costOf, type Price } from '../../../../src/domain/budget/price.js';
import { lookupPrice, type PriceTable } from '../../../../src/domain/budget/price-table.js';
import { priceCall } from '../../../../src/infrastructure/guards/budget-pricing.js';
import { loadPriceTable } from '../../../../src/infrastructure/budget/price-file.js';
import {
  anthropicPages,
  micros,
  openaiPages,
  type PagePrice,
} from '../../../support/provider-price-pages.js';

// RF-420, RF-427, Q-56: the shipped price table holds every Anthropic model available on the Claude
// API and every OpenAI standard text model of the provider pages checked on 2026-10-21, with the
// prices of the pages (tests/support/provider-price-pages.ts), the 5-minute cache write for
// Anthropic and the input price for OpenAI, and one long-prompt tier where the page gives one.

const shipped = fileURLToPath(new URL('../../../../prices/default-prices.yaml', import.meta.url));

let table: PriceTable;

beforeAll(async () => {
  table = await loadPriceTable(shipped);
});

function priceOf(provider: string, model: string): Price {
  const found = table.prices.find((each) => each.provider === provider && each.model === model);
  if (found === undefined) throw new Error(`The table has no ${provider} ${model}`);
  return found;
}

/** What the table holds for a model, and what the page says, in the same shape. */
function held(page: PagePrice): unknown {
  const price = priceOf(page.provider, page.model);
  return {
    input: price.inputPerMillionMicros,
    cacheWrite: price.cacheWriteInputPerMillionMicros,
    cacheHit: price.cachedInputPerMillionMicros,
    output: price.outputPerMillionMicros,
    tier: price.longPrompt,
  };
}

function said(page: PagePrice): unknown {
  const { tier } = page;
  return {
    input: micros(page.input),
    cacheWrite: micros(page.cacheWrite),
    cacheHit: micros(page.cacheHit),
    output: micros(page.output),
    tier:
      tier === undefined
        ? undefined
        : {
            overInputTokens: tier.over,
            inputPerMillionMicros: micros(tier.input),
            outputPerMillionMicros: micros(tier.output),
            cachedInputPerMillionMicros: micros(tier.cacheHit),
            cacheWriteInputPerMillionMicros: micros(tier.cacheWrite),
          },
  };
}

describe('the shipped price table against the provider pages', () => {
  it('RF-420 is dated 2026-10-21', () => {
    expect(table.version).toBe('2026-10-21');
  });

  it.each(anthropicPages.map((page) => [page.model, page] as const))(
    'RF-420 prices the Anthropic model %s as the pricing page does',
    (_model, page) => {
      expect(held(page)).toEqual(said(page));
    },
  );

  it.each(openaiPages.map((page) => [page.model, page] as const))(
    'RF-420 prices the OpenAI model %s as the pricing page does',
    (_model, page) => {
      expect(held(page)).toEqual(said(page));
    },
  );

  it('RF-420 lists no Anthropic or OpenAI model that is not on a page', () => {
    const onPages = new Set(
      [...anthropicPages, ...openaiPages].map((page) => `${page.provider}\n${page.model}`),
    );
    // gpt-5-nano-2025-08-07 stays: the table priced it before (DEC-106) and projects may name it.
    const extra = table.prices
      .filter((price) => price.provider === 'anthropic' || price.provider === 'openai')
      .filter((price) => !onPages.has(`${price.provider}\n${price.model}`))
      .map((price) => price.model);

    expect(extra).toEqual(['gpt-5-nano-2025-08-07']);
  });

  it('RF-420 keeps the Ollama entry, priced at zero', () => {
    expect(priceOf('ollama', 'gemma4:e4b').inputPerMillionMicros).toBe(0n);
  });
});

describe('a server-key call priced from the shipped table', () => {
  const usage = (inputTokens: number) => ({ inputTokens, cachedInputTokens: 0, outputTokens: 0 });

  function server(provider: string, model: string): Price {
    const lookup = lookupPrice(table, [], { provider, model, keySource: 'server' });
    if (lookup.kind !== 'priced') throw new Error(`${model} has no price`);
    return lookup.price;
  }

  it('RF-420 prices Claude Haiku 5.5 on a server key at both tiers, 100,000 being the lower', () => {
    const haiku = server('anthropic', 'claude-haiku-5-5');

    expect(costOf(haiku, usage(30_000)).micros).toBe(3_000n);
    expect(costOf(haiku, usage(100_000)).micros).toBe(10_000n);
    expect(costOf(haiku, usage(120_000)).micros).toBe(60_000n);
  });

  it('RF-420 counts cache reads and writes together toward the Haiku 5.5 threshold', () => {
    const haiku = server('anthropic', 'claude-haiku-5-5');
    const crossing = {
      inputTokens: 120_000,
      cachedInputTokens: 60_000,
      cacheWriteInputTokens: 50_000,
      outputTokens: 0,
    };

    // 10,000 plain x 0.50 + 60,000 read x 0.05 + 50,000 written x 0.625, per million
    expect(costOf(haiku, crossing).micros).toBe(39_250n);
  });

  it('RF-420 prices an OpenAI model with a long-context tier over 272,000 input tokens', () => {
    const sol = server('openai', 'gpt-5.6-sol');

    expect(costOf(sol, usage(272_000)).micros).toBe(1_088_000n);
    expect(costOf(sol, usage(272_001)).micros).toBe(2_176_008n);
  });

  it('RF-420 prices an Ollama model at zero as before', () => {
    const lookup = lookupPrice(table, [], {
      provider: 'ollama',
      model: 'any-local-model',
      keySource: 'none',
    });

    expect(lookup.kind === 'priced' && costOf(lookup.price, usage(900_000)).micros).toBe(0n);
  });
});

describe('the guard on a server key', () => {
  it('RF-427 does not refuse an Anthropic model on a server key (the guard finds its price)', () => {
    for (const { model } of anthropicPages) {
      const call = priceCall(
        { table, overrides: [], allowUnpriced: false },
        { kind: 'anthropic', keySource: 'server' },
        model,
      );
      expect(call.price?.model).toBe(model);
    }
  });
});
