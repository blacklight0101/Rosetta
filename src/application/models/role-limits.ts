import type { AgentRole, ProviderKind } from '../ports/llm-provider.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import type { ModelList } from './model-list.js';

// RF-405, RF-201, Q-57: the context window and the output limit a role runs with.
//
// Context: a number the project sets for the role's provider wins; an Ollama role takes the context
// the server gives it (P3-64, P3-75), which the estimate assumes to be Ollama's 32,768-token floor;
// any other role takes the window its model has in the shipped list, and 128,000 tokens when the
// list gives none. Output: a limit the project stores for the role wins; otherwise a hosted model
// (Anthropic, OpenAI) takes the smaller of its maximum output in the list and the default of the
// role, and every other provider the defaults the roles always had.

/** The output limit of a role on Ollama or a compatible server: the defaults of P3-64. */
export const OLLAMA_OUTPUT_TOKENS = {
  reader: 4_096,
  verifier: 2_048,
  planner: 16_384,
  summariser: 2_048,
} as const satisfies Record<AgentRole, number>;

/** Q-57: the output limit of a role on a hosted model, before the model's own maximum. */
const HOSTED_OUTPUT_TOKENS = {
  reader: 16_000,
  verifier: 4_000,
  planner: 32_000,
  summariser: 4_000,
} as const satisfies Record<AgentRole, number>;

/** The context assumed for Ollama when the server decides it (the floor of the automatic choice). */
const OLLAMA_CONTEXT_TOKENS = 32_768;
/** The context assumed for a hosted model the list gives no window for. */
const HOSTED_CONTEXT_TOKENS = 128_000;

/** What a role needs of its limits. */
export interface RoleLimits {
  readonly contextTokens: number;
  /** True for an Ollama context that is chosen at run time: `contextTokens` is then the floor assumed. */
  readonly contextAutomatic: boolean;
  /** The window the shipped list gives the model; undefined when it gives none or for another provider. */
  readonly modelContextTokens: number | undefined;
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

/** The context of a role: the project's number, Ollama's floor, or the window of the list (Q-57). */
export function contextOf(
  configured: number | 'auto' | undefined,
  kind: ProviderKind | undefined,
  modelContextTokens: number | undefined,
): Pick<RoleLimits, 'contextTokens' | 'contextAutomatic'> {
  if (typeof configured === 'number') return { contextTokens: configured, contextAutomatic: false };
  if (kind === 'ollama') return { contextTokens: OLLAMA_CONTEXT_TOKENS, contextAutomatic: true };
  return { contextTokens: modelContextTokens ?? HOSTED_CONTEXT_TOKENS, contextAutomatic: false };
}

function defaultOutput(
  role: AgentRole,
  kind: ProviderKind | undefined,
  modelMaximum: number | undefined,
): number {
  if (!isListed(kind)) return OLLAMA_OUTPUT_TOKENS[role];
  return Math.min(modelMaximum ?? HOSTED_OUTPUT_TOKENS[role], HOSTED_OUTPUT_TOKENS[role]);
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
    modelContextTokens: entry?.contextTokens,
    maxOutputTokens: maxOutputTokens ?? defaultOutput(role, config?.kind, entry?.maxOutputTokens),
  };
}
