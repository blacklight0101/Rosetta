import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { LongPromptTier, Price } from '../../domain/budget/price.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-420, DEC-54, data-model.md section 3.18: the price table file (`prices/default-prices.yaml`):
// `{ schemaVersion, version (date), currency, models: [{ provider, model, inputPerMillionMicros,
// outputPerMillionMicros, cachedInputPerMillionMicros, cacheWriteInputPerMillionMicros? }] }`. The
// cache-write price is optional; the price lookup decides what its absence means (P2-16, RF-427).
// An entry may also carry one `longPrompt` tier (Q-56): `{ overInputTokens, inputPerMillionMicros,
// outputPerMillionMicros, cachedInputPerMillionMicros, cacheWriteInputPerMillionMicros }`, all
// required, the prices of a call whose input tokens are over the threshold.
// Prices are whole micro-dollars per
// million tokens; the currency is USD (DEC-54). Anything else, a model listed twice, or a file that
// cannot be read is refused with RST-1602 rather than guessed, so no call is ever priced wrong.

const micros = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const providerKind = z.enum(['ollama', 'openai', 'openai-compatible', 'anthropic', 'fake']);

// Q-56: the prices of a call whose input tokens (cache reads and writes included) are over the
// threshold; every price is required, so a tier is never completed by a guess.
const longPromptSchema = z.strictObject({
  overInputTokens: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  inputPerMillionMicros: micros,
  outputPerMillionMicros: micros,
  cachedInputPerMillionMicros: micros,
  cacheWriteInputPerMillionMicros: micros,
});

const priceFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  currency: z.literal('USD'),
  models: z.array(
    z.strictObject({
      provider: providerKind,
      model: z.string().min(1).max(200),
      inputPerMillionMicros: micros,
      outputPerMillionMicros: micros,
      cachedInputPerMillionMicros: micros,
      cacheWriteInputPerMillionMicros: micros.exactOptional(),
      longPrompt: longPromptSchema.exactOptional(),
    }),
  ),
});

type PriceEntry = z.infer<typeof priceFileSchema>['models'][number];

function invalid(message: string, cause?: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.priceTableInvalid, message, { cause });
}

function tierOf(tier: z.infer<typeof longPromptSchema>): LongPromptTier {
  return {
    overInputTokens: tier.overInputTokens,
    inputPerMillionMicros: BigInt(tier.inputPerMillionMicros),
    outputPerMillionMicros: BigInt(tier.outputPerMillionMicros),
    cachedInputPerMillionMicros: BigInt(tier.cachedInputPerMillionMicros),
    cacheWriteInputPerMillionMicros: BigInt(tier.cacheWriteInputPerMillionMicros),
  };
}

function priceOf(entry: PriceEntry): Price {
  const cacheWrite = entry.cacheWriteInputPerMillionMicros;
  const { longPrompt } = entry;
  return {
    provider: entry.provider,
    model: entry.model,
    inputPerMillionMicros: BigInt(entry.inputPerMillionMicros),
    outputPerMillionMicros: BigInt(entry.outputPerMillionMicros),
    cachedInputPerMillionMicros: BigInt(entry.cachedInputPerMillionMicros),
    // P2-16: never a zero for a missing cache-write price; the lookup handles its absence.
    ...(cacheWrite === undefined ? {} : { cacheWriteInputPerMillionMicros: BigInt(cacheWrite) }),
    ...(longPrompt === undefined ? {} : { longPrompt: tierOf(longPrompt) }),
    currency: 'USD',
  };
}

function readYaml(text: string): unknown {
  try {
    const value: unknown = parse(text);
    return value;
  } catch (error) {
    throw invalid('The price table is not valid YAML.', error);
  }
}

/** The price table in the text of a price file (RF-420). */
// RF-420
export function parsePriceTable(text: string): PriceTable {
  const parsed = priceFileSchema.safeParse(readYaml(text));
  if (!parsed.success) throw invalid('The price table does not match its schema.', parsed.error);
  const { version, models } = parsed.data;
  const seen = new Set<string>();
  for (const { provider, model } of models) {
    const key = `${provider}\n${model}`;
    if (seen.has(key)) throw invalid(`The price table lists ${provider} ${model} twice.`);
    seen.add(key);
  }
  return { version, currency: 'USD', prices: models.map(priceOf) };
}

/** Reads and parses a price file; RST-1602 when it is missing or invalid. */
// RF-420
export async function loadPriceTable(path: string): Promise<PriceTable> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw invalid('The price table could not be read.', error);
  }
  return parsePriceTable(text);
}
