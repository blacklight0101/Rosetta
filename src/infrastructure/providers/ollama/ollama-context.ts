import type { OllamaContextSource } from '../../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';

// RF-401, DEC-114, Q-23: the Ollama context size (`num_ctx`). `auto` (the default) picks the largest
// size that keeps the whole model in GPU memory; a number is sent unchanged.

/** `providers.<name>.contextTokens` (data-model.md section 3.1). */
export type ContextSetting = 'auto' | number;

/** The size sent as `num_ctx` and how it was chosen, for the call log. */
export interface ContextChoice {
  readonly tokens: number;
  readonly source: OllamaContextSource;
  /** The model's trained context when it is known: the most `auto` may grow to (Q-48). */
  readonly trainedTokens?: number;
}

/** Q-23: `auto` never starts above this size. */
export const CONTEXT_CEILING = 32_768;
/** Q-23: `auto` never halves below this size. */
export const CONTEXT_FLOOR = 4_096;
/** P1-69: how long a fallback is reused before Ollama is probed again. */
export const FALLBACK_BACKOFF_MS = 30_000;
/** P1-69: the most an /api/show or /api/ps probe may take (a model load keeps the call timeout). */
export const PROBE_TIMEOUT_MS = 10_000;
/** data-model.md 3.1: the smallest fixed size accepted. */
export const MIN_FIXED_CONTEXT = 1_024;

/** The setting, `auto` when left out; a fixed size below 1024 tokens is refused with RST-1514. */
export function contextSettingOf(value: ContextSetting | undefined): ContextSetting {
  if (value === undefined || value === 'auto') return 'auto';
  if (Number.isInteger(value) && value >= MIN_FIXED_CONTEXT) return value;
  throw new RosettaError(
    ERROR_CODES.ollamaContextTokensInvalid,
    `contextTokens ${String(value)} is not allowed: use auto or a whole number of at least ${String(MIN_FIXED_CONTEXT)}.`,
  );
}
