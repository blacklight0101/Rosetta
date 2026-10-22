import { worstCaseCost } from '../../domain/budget/price.js';
import type { Project } from '../projects/project.js';
import { planCaps, type PlanCapDependencies } from './plan-caps.js';
import type { FirstCalls } from './estimate-types.js';
import { priceOfRole, type RolePricing } from './role-estimate.js';
import { roleLimits } from '../models/role-limits.js';
import type { ModelList } from '../models/model-list.js';
import { readerParallelism } from '../understand/reader-settings.js';

// RF-405, RF-422, RF-1106, Q-57, DEC-159: what the budget guard reserves for the first reader
// calls, all in flight at once, and which caps (the same `capsFor` and `checkCaps` as the guard
// and the plan estimate) cannot hold it. Each call reserves its worst case: the prompt at the
// dearest input price plus the whole output limit. A model that fits shows nothing short.

/**
 * The prompt of a first call, at the guard's four characters per token: the system prompt, the
 * tools and the first message. The same figure as the test that sends every listed model through
 * the guard under the default caps.
 */
export const FIRST_CALL_PROMPT_TOKENS = 6_000;

export interface FirstCallsInputs {
  /** The reader tasks the run starts (one per area). */
  readonly tasks: number;
  readonly models: ModelList;
}

// RF-405, RF-422
export async function firstCallsOf(
  deps: PlanCapDependencies & RolePricing,
  project: Project,
  inputs: FirstCallsInputs,
): Promise<FirstCalls> {
  const { settings } = project;
  const calls = Math.min(readerParallelism(settings), inputs.tasks);
  const { maxOutputTokens } = roleLimits(settings, 'reader', inputs.models);
  const priced = await priceOfRole(deps, project, 'reader');
  const promptTokens = FIRST_CALL_PROMPT_TOKENS;
  const one =
    priced.lookup.kind === 'priced'
      ? worstCaseCost(priced.lookup.price, { promptTokens, maxOutputTokens }).micros
      : 0n;
  const reservedMicros = one * BigInt(calls);
  const reservedTokens = BigInt(calls) * BigInt(promptTokens + maxOutputTokens);
  const point = {
    inputTokens: calls * promptTokens,
    outputTokens: calls * maxOutputTokens,
    costMicros: reservedMicros,
  };
  const { caps } = await planCaps(
    deps,
    project,
    { keySource: priced.keySource, points: { low: point, likely: point, high: point } },
    'reader',
  );
  const admin = priced.keySource === 'server' ? (await deps.serverSettings.caps()).runMicros : null;
  return {
    ...{ calls, promptTokens, maxOutputTokens, reservedMicros, reservedTokens },
    perCallMicros: one,
    adminRunCapMicros: admin,
    caps: caps.map((cap) => ({
      ...{ kind: cap.kind, unit: cap.unit, limit: cap.limit, spent: cap.spent },
      fits: cap.fits.high,
    })),
  };
}
