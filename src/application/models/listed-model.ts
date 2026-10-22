import type { ProviderKind } from '../ports/llm-provider.js';
import type { ModelList } from './model-list.js';

// RF-405, RF-402, DEC-163: what the shipped model list says of one model, and the most a role may
// write on it (its maximum output, or 32,768 when the list gives none).

/** The most output a role may be set to on a model the list gives no maximum for (DEC-163). */
export const FALLBACK_OUTPUT_CEILING = 32_768;

/** The providers whose models the shipped list describes. */
export function isListed(kind: ProviderKind | undefined): kind is 'anthropic' | 'openai' {
  return kind === 'anthropic' || kind === 'openai';
}

/** The entry of the shipped list for a model of a hosted provider; other providers have none. */
export function listedEntry(
  list: ModelList,
  kind: ProviderKind | undefined,
  model: string,
): ModelList['models'][number] | undefined {
  if (!isListed(kind)) return undefined;
  return list.models.find((entry) => entry.provider === kind && entry.model === model);
}

/** DEC-163: the largest output limit a role on this model may have. */
export function outputCeilingOf(
  list: ModelList,
  kind: ProviderKind | undefined,
  model: string,
): number {
  return listedEntry(list, kind, model)?.maxOutputTokens ?? FALLBACK_OUTPUT_CEILING;
}
