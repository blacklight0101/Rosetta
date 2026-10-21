import type { ProjectSettings } from '../api/project-schemas.js';
import type { ModelListState } from './model-lists.js';

// RF-401, DEC-114, Q-23, Q-44: the Ollama context size as the pages hold it. The draft is the text
// `auto` or the digits of a number of tokens. A number goes from the floor of the automatic choice
// (Q-23) up to the smallest trained context among the models of the Ollama roles, which the model
// list carries from /api/show (Q-44); when none is known the bound falls back to 131,072.

export const CONTEXT_MIN = 4096;
const CONTEXT_MAX = 131_072;

/** The trained context that bounds the field, and the model it belongs to. */
export interface ContextLimit {
  readonly tokens: number;
  readonly model: string;
}

const count = (tokens: number): string => tokens.toLocaleString('en-US');

/** The upper bound of the field: the trained context when known, else the fallback. */
export function contextMax(limit: ContextLimit | undefined): number {
  return limit === undefined ? CONTEXT_MAX : Math.max(limit.tokens, CONTEXT_MIN);
}

/** The smallest trained context among `models` in the Ollama list; undefined when none is known. */
export function contextLimitOf(
  models: readonly string[],
  list: ModelListState | undefined,
): ContextLimit | undefined {
  if (list?.status !== 'ready') return undefined;
  const known = models.flatMap((name) => {
    const trained = list.models.find((entry) => entry.model === name)?.trainedContext;
    return trained === undefined ? [] : [{ model: name, tokens: trained }];
  });
  return known.reduce<ContextLimit | undefined>(
    (least, next) => (least === undefined || next.tokens < least.tokens ? next : least),
    undefined,
  );
}

export type ContextSize = 'auto' | number;

export type ContextResult =
  | { readonly ok: true; readonly value: ContextSize }
  | { readonly ok: false; readonly message: string };

/** What the field shows for a stored `contextTokens`; a document without it reads as Auto. */
export function contextDraftOf(contextTokens: ContextSize | undefined): string {
  return contextTokens === undefined ? 'auto' : String(contextTokens);
}

// RF-401
export function parseContextSize(text: string, limit?: ContextLimit): ContextResult {
  const trimmed = text.trim();
  if (trimmed === 'auto') return { ok: true, value: 'auto' };
  if (!/^\d+$/u.test(trimmed) || !Number.isSafeInteger(Number(trimmed))) {
    return { ok: false, message: 'Enter a whole number of tokens, for example 65536.' };
  }
  const tokens = Number(trimmed);
  if (tokens < CONTEXT_MIN) {
    return {
      ok: false,
      message: `Enter at least ${count(CONTEXT_MIN)} tokens, the smallest size Rosetta picks.`,
    };
  }
  const max = contextMax(limit);
  if (tokens > max) {
    const reason =
      limit === undefined ? '.' : `: ${limit.model} was trained for ${count(limit.tokens)} tokens.`;
    return { ok: false, message: `Enter at most ${count(max)} tokens${reason}` };
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

/** The path the server uses for the field in a project's settings. */
export const contextPath = 'providers.ollama.contextTokens';

type RoleChoices = Readonly<Record<string, { readonly provider: string; readonly model: string }>>;

/** RF-401: the Ollama context size has a field while a role uses Ollama. */
export function usesOllama(roles: RoleChoices): boolean {
  return Object.values(roles).some((role) => role.provider === 'ollama');
}

/** The models of the roles on Ollama, which bound the field (Q-44). */
export function ollamaModels(roles: RoleChoices): readonly string[] {
  return Object.values(roles).flatMap((role) =>
    role.provider === 'ollama' ? [role.model.trim()] : [],
  );
}
