import type { ProjectSettings } from '../api/project-schemas.js';

// RF-401, DEC-114, Q-23, Q-44: the Ollama context size as the pages hold it. The draft is the text
// `auto` or the digits of a number of tokens. The page cannot ask Ollama for the trained context of
// a model, so it checks the floor of the automatic choice (Q-23) and a fixed upper bound; the
// server keeps the same two numbers for the default models (OLLAMA_CONTEXT_MIN / _MAX).

export const CONTEXT_MIN = 4096;
export const CONTEXT_MAX = 131_072;

export type ContextSize = 'auto' | number;

export type ContextResult =
  | { readonly ok: true; readonly value: ContextSize }
  | { readonly ok: false; readonly message: string };

/** What the field shows for a stored `contextTokens`; a document without it reads as Auto. */
export function contextDraftOf(contextTokens: ContextSize | undefined): string {
  return contextTokens === undefined ? 'auto' : String(contextTokens);
}

// RF-401
export function parseContextSize(text: string): ContextResult {
  const trimmed = text.trim();
  if (trimmed === 'auto') return { ok: true, value: 'auto' };
  if (!/^\d+$/u.test(trimmed) || !Number.isSafeInteger(Number(trimmed))) {
    return { ok: false, message: 'Enter a whole number of tokens, for example 65536.' };
  }
  const tokens = Number(trimmed);
  if (tokens < CONTEXT_MIN) {
    return {
      ok: false,
      message: `Enter at least ${String(CONTEXT_MIN)} tokens, the smallest size Rosetta picks.`,
    };
  }
  if (tokens > CONTEXT_MAX) {
    return { ok: false, message: `Enter at most ${String(CONTEXT_MAX)} tokens.` };
  }
  return { ok: true, value: tokens };
}

/**
 * The project's providers with the chosen size on the Ollama entry. Auto on an entry saved without
 * the field leaves it without (the same behaviour, DEC-114); a project with no entry yet gets none.
 */
export function withContextSize(
  providers: ProjectSettings['providers'],
  size: ContextSize,
): ProjectSettings['providers'] {
  const entry = providers['ollama'];
  if (entry === undefined) return providers;
  if (size === 'auto' && entry.contextTokens === undefined) return providers;
  return { ...providers, ollama: { ...entry, contextTokens: size } };
}
