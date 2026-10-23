import { contextOf, roleLimits } from '../models/role-limits.js';
import type { ModelList } from '../models/model-list.js';
import type { ProviderKind } from '../ports/llm-provider.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { PlanWindow } from './plan-packing.js';
import type { ProjectSettings } from '../projects/project-settings.js';

// P3-113, EV-29, RF-405, Q-57, P3-75: the window a planner prompt is packed to. The number the
// project sets for the provider wins, up to the model's window; otherwise a hosted model has the
// window the shipped list gives it (128,000 tokens when the list gives none), and an Ollama model
// with an automatic context has 131,072 tokens: the automatic context grows to the trained context
// of the model (P3-75), which the plan cannot ask the server for, and 131,072 tokens is the
// context of the local models the plan is run on. A local model trained on less is set with a
// number in the project settings.

/** The window assumed for an Ollama planner whose context is automatic. */
const OLLAMA_PLAN_WINDOW_TOKENS = 131_072;

// P3-113
export function plannerWindowTokens(
  configured: number | 'auto' | undefined,
  kind: ProviderKind | undefined,
  modelContextTokens: number | undefined,
): number {
  if (typeof configured === 'number') {
    return contextOf(configured, kind, modelContextTokens).contextTokens;
  }
  if (kind === 'ollama') return OLLAMA_PLAN_WINDOW_TOKENS;
  return modelContextTokens ?? contextOf(configured, kind, modelContextTokens).contextTokens;
}

/** The planner's window from the project settings alone, as the estimate knows it. */
// P3-113
export function plannerWindowOf(settings: ProjectSettings, list: ModelList): number {
  const { provider } = settings.roles.planner;
  const config = Object.hasOwn(settings.providers, provider)
    ? settings.providers[provider]
    : undefined;
  const { modelContextTokens } = roleLimits(settings, 'planner', list);
  return plannerWindowTokens(config?.contextTokens, config?.kind, modelContextTokens);
}

/** The planner's window and output limit as a run knows them, which every call of the run is packed to. */
// P3-113
export function windowOfRole(planner: RoleProvider, settings: ProjectSettings): PlanWindow {
  const configured = settings.providers[planner.name]?.contextTokens;
  const windowTokens = plannerWindowTokens(configured, planner.kind, planner.modelContextTokens);
  return { windowTokens, maxOutputTokens: planner.maxOutputTokens };
}
