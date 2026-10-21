import type { AgentRole } from '../ports/llm-provider.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import type { ModelList } from './model-list.js';

// RF-405, RF-201, Q-57: the context window and the output limit a role runs with. (Stub: today's
// behaviour, every hosted model with 128,000 tokens and the role's stored limit.)

/** The output limit of an Ollama role, today's defaults (P3-64). */
export const OLLAMA_OUTPUT_TOKENS = {
  reader: 4_096,
  verifier: 2_048,
  planner: 16_384,
  summariser: 2_048,
} as const;

export interface RoleLimits {
  readonly contextTokens: number;
  readonly contextAutomatic: boolean;
  readonly modelContextTokens: number | undefined;
  readonly maxOutputTokens: number;
}

export function roleLimits(
  settings: ProjectSettings,
  role: AgentRole,
  list: ModelList,
): RoleLimits {
  if (!Reflect.has(list, 'models')) throw new Error('A model list is required.');
  const { provider, maxOutputTokens } = settings.roles[role];
  const config = settings.providers[provider];
  const ollama = config?.kind === 'ollama';
  return {
    contextTokens: ollama ? 32_768 : 128_000,
    contextAutomatic: ollama,
    modelContextTokens: undefined,
    maxOutputTokens,
  };
}
