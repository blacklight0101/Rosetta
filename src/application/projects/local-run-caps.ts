import { isLocalKind } from '../../domain/budget/price-table.js';
import {
  MAX_RUN_COST_MICROS,
  MAX_RUN_TOKENS,
  ROLE_NAMES,
  type ProjectSettings,
} from './project-settings.js';

// RF-433, DEC-197: "No cap for local models". With the project setting on, a run whose every role
// is on a local provider (a kind the price table prices at zero) has no token cap and no pause at
// its approved amount; the budget guard still meters every call, and the administrator ceilings
// of the run caps and the day, month and role caps stay hard limits (DEC-112). One cloud role
// keeps every cap and the pause of RF-432.

/** RF-433: the run on these settings is free of the project's run caps and of the pause. */
// RF-433
export function uncappedLocalRun(settings: ProjectSettings): boolean {
  if (settings.budget.noCapForLocalModels !== true) return false;
  return ROLE_NAMES.every((role) => {
    const provider = settings.providers[settings.roles[role].provider];
    return provider !== undefined && isLocalKind(provider.kind);
  });
}

/**
 * RF-422, RF-433: the run caps a run on these settings is held to: the project's, or for an
 * uncapped local run the administrator ceilings, which stay hard limits (DEC-112).
 */
// RF-433
export function runCapsFor(settings: ProjectSettings): ProjectSettings['budget']['run'] {
  if (!uncappedLocalRun(settings)) return settings.budget.run;
  return { maxCostMicros: MAX_RUN_COST_MICROS, maxTokens: MAX_RUN_TOKENS };
}
