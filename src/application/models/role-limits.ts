import type { AgentRole, ProviderKind } from '../ports/llm-provider.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import type { ModelList } from './model-list.js';

// RF-405, RF-201, Q-57: the context window and the output limit a role runs with.
//
// Context: a number the project sets for the role's provider wins, but never above the window its
// model has in the shipped list; an Ollama role takes the context the server gives it (P3-64, P3-75),
// which the estimate assumes to be Ollama's 32,768-token floor; any other role keeps 128,000 tokens
// unless the project sets a number, so a long conversation is cut at the same place as before and the
// budget guard's worst case stays the one the default caps were set for. The window of the list is
// the upper bound of a number the project sets, and is shown on the start page. Output: a limit the
// project stores for the role wins; otherwise a hosted model (Anthropic, OpenAI) takes the smaller of
// its maximum output in the list and the default of the role, and every other provider the defaults
// the roles always had.

/** The output limit of a role on Ollama or a compatible server: the defaults of P3-64. */
export const OLLAMA_OUTPUT_TOKENS = {
  reader: 4_096,
  verifier: 2_048,
  planner: 16_384,
  summariser: 2_048,
} as const satisfies Record<AgentRole, number>;

/**
 * Q-57: the output limit of a role on a hosted model, before the model's own maximum. They are sized
 * so that the default run cap (0.50 USD) lets the parallel reader calls and the first planner call
 * through the budget guard on every model of the list but the dearest.
 */
const HOSTED_OUTPUT_TOKENS = {
  reader: 8_192,
  verifier: 4_000,
  planner: 16_384,
  summariser: 4_000,
} as const satisfies Record<AgentRole, number>;

/** The context assumed for Ollama when the server decides it (the floor of the automatic choice). */
const OLLAMA_CONTEXT_TOKENS = 32_768;
/** The context of a hosted role the project sets no number for. */
const HOSTED_CONTEXT_TOKENS = 128_000;

/** What a role needs of its limits. */
export interface RoleLimits {
  readonly contextTokens: number;
  /** True for an Ollama context that is chosen at run time: `contextTokens` is then the floor assumed. */
  readonly contextAutomatic: boolean;
  /** The window the shipped list gives the model, the upper bound of a context number; undefined when it gives none or for another provider. */
  readonly modelContextTokens: number | undefined;
  /** The maximum output the shipped list gives the model, the ceiling of the empty-answer retry (P3-100); undefined when it gives none. */
  readonly modelMaxOutputTokens: number | undefined;
  readonly maxOutputTokens: number;
}

/** The providers whose models the shipped list describes. */
function isListed(kind: ProviderKind | undefined): kind is 'anthropic' | 'openai' {
  return kind === 'anthropic' || kind === 'openai';
}

/** The entry of the shipped list for a model of a hosted provider; other providers have none. */
function listedEntry(list: ModelList, kind: ProviderKind | undefined, model: string) {
  if (!isListed(kind)) return undefined;
  return list.models.find((entry) => entry.provider === kind && entry.model === model);
}

/** The context of a role: the project's number up to the model's window, Ollama's floor, or 128,000 (Q-57). */
export function contextOf(
  configured: number | 'auto' | undefined,
  kind: ProviderKind | undefined,
  modelContextTokens: number | undefined,
): Pick<RoleLimits, 'contextTokens' | 'contextAutomatic'> {
  if (typeof configured === 'number') {
    return {
      contextTokens: Math.min(configured, modelContextTokens ?? configured),
      contextAutomatic: false,
    };
  }
  if (kind === 'ollama') return { contextTokens: OLLAMA_CONTEXT_TOKENS, contextAutomatic: true };
  return { contextTokens: HOSTED_CONTEXT_TOKENS, contextAutomatic: false };
}

function defaultOutput(
  role: AgentRole,
  kind: ProviderKind | undefined,
  modelMaximum: number | undefined,
): number {
  if (!isListed(kind)) return OLLAMA_OUTPUT_TOKENS[role];
  return Math.min(modelMaximum ?? HOSTED_OUTPUT_TOKENS[role], HOSTED_OUTPUT_TOKENS[role]);
}

/** What the shipped list says of the model's window and maximum output (P3-100). */
function modelNumbers(
  entry: ReturnType<typeof listedEntry>,
): Pick<RoleLimits, 'modelContextTokens' | 'modelMaxOutputTokens'> {
  return { modelContextTokens: entry?.contextTokens, modelMaxOutputTokens: entry?.maxOutputTokens };
}

// RF-405, RF-201, Q-57
export function roleLimits(
  settings: ProjectSettings,
  role: AgentRole,
  list: ModelList,
): RoleLimits {
  const { provider, model, maxOutputTokens } = settings.roles[role];
  const config = Object.hasOwn(settings.providers, provider)
    ? settings.providers[provider]
    : undefined;
  const entry = listedEntry(list, config?.kind, model);
  return {
    ...contextOf(config?.contextTokens, config?.kind, entry?.contextTokens),
    ...modelNumbers(entry),
    maxOutputTokens: maxOutputTokens ?? defaultOutput(role, config?.kind, entry?.maxOutputTokens),
  };
}
