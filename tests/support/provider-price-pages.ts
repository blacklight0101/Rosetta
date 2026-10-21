// RF-420, Q-56: the prices of the provider pages as checked on 2026-10-21, in USD per million
// tokens as the pages print them. Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
// (the 5-minute cache write column) and the ids of each model page under
// https://platform.claude.com/docs/en/models/; OpenAI: https://developers.openai.com/api/docs/pricing
// (Standard tier, flagship tables). A dash for the cached input of OpenAI is written as the input
// price, and OpenAI bills no cache write of its own, so its cache write is the input price.

export interface PageTier {
  /** The prompt length the tier starts after, in input tokens. */
  readonly over: number;
  readonly input: string;
  readonly cacheWrite: string;
  readonly cacheHit: string;
  readonly output: string;
}

export interface PagePrice {
  readonly provider: 'anthropic' | 'openai';
  readonly model: string;
  readonly input: string;
  readonly cacheWrite: string;
  readonly cacheHit: string;
  readonly output: string;
  readonly tier?: PageTier;
}

function anthropic(model: string, figures: readonly [string, string, string, string]): PagePrice {
  const [input, cacheWrite, cacheHit, output] = figures;
  return { provider: 'anthropic', model, input, cacheWrite, cacheHit, output };
}

function openai(
  model: string,
  figures: readonly [string, string | undefined, string],
  longContext?: readonly [string, string | undefined, string],
): PagePrice {
  const [input, cached, output] = figures;
  const entry: PagePrice = {
    provider: 'openai',
    model,
    input,
    cacheWrite: input,
    cacheHit: cached ?? input,
    output,
  };
  if (longContext === undefined) return entry;
  const [longInput, longCached, longOutput] = longContext;
  const tier: PageTier = {
    over: 272_000,
    input: longInput,
    cacheWrite: longInput,
    cacheHit: longCached ?? longInput,
    output: longOutput,
  };
  return { ...entry, tier };
}

const opus5 = ['5', '6.25', '0.50', '25'] as const;
const sonnet46 = ['3', '3.75', '0.30', '15'] as const;

export const haiku55Tier: PageTier = {
  over: 100_000,
  input: '0.50',
  cacheWrite: '0.625',
  cacheHit: '0.05',
  output: '2.50',
};

export const anthropicPages: readonly PagePrice[] = [
  anthropic('claude-fable-5-1', ['10', '12.50', '0.25', '50']),
  anthropic('claude-fable-5', ['10', '12.50', '1', '50']),
  anthropic('claude-opus-5-5', ['4', '5', '0.20', '20']),
  anthropic('claude-opus-5', opus5),
  anthropic('claude-opus-4-8', opus5),
  anthropic('claude-opus-4-7', opus5),
  anthropic('claude-opus-4-6', opus5),
  anthropic('claude-opus-4-5-20251101', opus5),
  anthropic('claude-opus-4-5', opus5),
  anthropic('claude-sonnet-5-5', ['2', '2.50', '0.10', '10']),
  anthropic('claude-sonnet-5', ['2', '2.50', '0.20', '10']),
  anthropic('claude-sonnet-4-6', sonnet46),
  anthropic('claude-sonnet-4-5-20250929', sonnet46),
  anthropic('claude-sonnet-4-5', sonnet46),
  { ...anthropic('claude-haiku-5-5', ['0.10', '0.125', '0.01', '0.50']), tier: haiku55Tier },
  anthropic('claude-haiku-4-5-20251001', ['1', '1.25', '0.10', '5']),
  anthropic('claude-haiku-4-5', ['1', '1.25', '0.10', '5']),
];

export const openaiPages: readonly PagePrice[] = [
  openai('gpt-6-astra', ['10.00', '1.00', '50.00'], ['20.00', '2.00', '75.00']),
  openai('gpt-6.1-sol', ['2.00', '0.10', '10.00'], ['4.00', '0.20', '15.00']),
  openai('gpt-6-luna', ['0.10', '0.01', '0.50'], ['0.20', '0.02', '0.75']),
  openai('gpt-6-sol', ['2.00', '0.20', '10.00'], ['4.00', '0.40', '15.00']),
  openai('gpt-5.6-sol', ['4.00', '0.40', '20.00'], ['8.00', '0.80', '30.00']),
  openai('gpt-5.6-terra', ['2.00', '0.20', '12.00'], ['4.00', '0.40', '18.00']),
  openai('gpt-5.6-luna', ['0.20', '0.02', '1.20'], ['0.40', '0.04', '1.80']),
  openai('gpt-5.5', ['5.00', '0.50', '30.00'], ['10.00', '1.00', '45.00']),
  openai('gpt-5.5-pro', ['30.00', undefined, '180.00'], ['60.00', undefined, '270.00']),
  openai('gpt-5.4', ['2.50', '0.25', '15.00'], ['5.00', '0.50', '22.50']),
  openai('gpt-5.4-pro', ['30.00', undefined, '180.00'], ['60.00', undefined, '270.00']),
  openai('gpt-5.4-mini', ['0.75', '0.075', '4.50']),
  openai('gpt-5.4-nano', ['0.20', '0.02', '1.25']),
  openai('gpt-5.2', ['1.75', '0.175', '14.00']),
  openai('gpt-5.2-pro', ['21.00', undefined, '168.00']),
  openai('gpt-5.1', ['1.25', '0.125', '10.00']),
  openai('gpt-5', ['1.25', '0.125', '10.00']),
  openai('gpt-5-mini', ['0.25', '0.025', '2.00']),
  openai('gpt-5-nano', ['0.05', '0.005', '0.40']),
  openai('gpt-5-pro', ['15.00', undefined, '120.00']),
  openai('gpt-4.1', ['2.00', '0.50', '8.00']),
  openai('gpt-4.1-mini', ['0.40', '0.10', '1.60']),
  openai('gpt-4.1-nano', ['0.10', '0.025', '0.40']),
  openai('gpt-4o', ['2.50', '1.25', '10.00']),
  openai('gpt-4o-2024-05-13', ['5.00', undefined, '15.00']),
  openai('gpt-4o-mini', ['0.15', '0.075', '0.60']),
  openai('o1', ['15.00', '7.50', '60.00']),
  openai('o1-pro', ['150.00', undefined, '600.00']),
  openai('o3-pro', ['20.00', undefined, '80.00']),
  openai('o3', ['2.00', '0.50', '8.00']),
  openai('o4-mini', ['1.10', '0.275', '4.40']),
  openai('o3-mini', ['1.10', '0.55', '4.40']),
  openai('gpt-4-turbo-2024-04-09', ['10.00', undefined, '30.00']),
  openai('gpt-4-0613', ['30.00', undefined, '60.00']),
  openai('gpt-3.5-turbo', ['0.50', undefined, '1.50']),
  openai('gpt-3.5-turbo-0125', ['0.50', undefined, '1.50']),
];

/** Whole micro-dollars of a price printed in USD with up to six decimals, without a float. */
export function micros(usd: string): bigint {
  const [whole = '0', fraction = ''] = usd.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}
