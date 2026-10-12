import type { RoleEstimate, RunEstimate, Scenario } from '../api/estimate-schemas.js';
import { microsToDollars } from './usd.js';

// RF-425, RF-143, DEC-108, DEC-54: what the start page works out of an estimate. Costs stay
// micro-dollars in a bigint until they are shown; a role whose model has no price (`priced` false)
// has a cost of zero in the data and is never shown as free: it is unknown, and a total that
// includes one is a lower bound.

export const scenarios: readonly Scenario[] = ['low', 'likely', 'high'];

/** `$0.39`: dollars with at least the cents and no trailing zeros beyond them. */
export function dollars(micros: bigint): string {
  return `$${microsToDollars(micros.toString())}`;
}

/** The cost shown for one scenario of a role: the amount, or "unknown" for an unpriced model. */
export function roleCost(role: RoleEstimate, scenario: Scenario): string {
  return role.priced ? dollars(BigInt(role[scenario].costMicros)) : 'unknown';
}

/** The roles whose cost the estimate cannot know. */
export function unpricedRoles(estimate: RunEstimate): readonly RoleEstimate[] {
  return estimate.roles.filter((role) => !role.priced);
}

/** The sum of the priced roles in a scenario; a lower bound when `unpricedRoles` is not empty. */
export function pricedTotal(estimate: RunEstimate, scenario: Scenario): bigint {
  return estimate.roles
    .filter((role) => role.priced)
    .reduce((sum, role) => sum + BigInt(role[scenario].costMicros), 0n);
}

/** The cost of the roles that use the user's own key, which the daily cap on own keys limits. */
export function ownKeyTotal(estimate: RunEstimate, scenario: Scenario): bigint {
  return estimate.roles
    .filter((role) => role.priced && role.keySource === 'user')
    .reduce((sum, role) => sum + BigInt(role[scenario].costMicros), 0n);
}

export function totalTokens(role: Pick<RoleEstimate, Scenario>, scenario: Scenario): number {
  return role[scenario].inputTokens + role[scenario].outputTokens;
}

/** A share of the cap in whole percent; a cap of zero is full as soon as anything is expected. */
export function percentOf(amount: bigint, cap: bigint): number {
  if (cap === 0n) return amount === 0n ? 0 : 100;
  return Math.round((Number(amount) / Number(cap)) * 100);
}

const LOCAL_KINDS: readonly string[] = ['ollama', 'fake'];

/**
 * RF-143: the roles whose provider is not a local one. An Ollama server on another machine also
 * needs the consent; the page cannot see its host, so the server's refusal (RST-1515) adds it.
 */
export function cloudRoles(estimate: RunEstimate): readonly RoleEstimate[] {
  return estimate.roles.filter((role) => !LOCAL_KINDS.includes(role.kind));
}
