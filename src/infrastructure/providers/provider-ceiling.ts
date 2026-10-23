import type { ProviderSetRequest } from '../../application/ports/provider-set-factory.js';
import type { UsageCap } from '../../domain/budget/usage-cap.js';

// ADR-007, RF-407: the ceiling of a call that belongs to no run (moved out of the provider factory
// unchanged, to keep that file under its size limit).

/** RF-407: the most one provider test call may cost or use, whoever pays (worst case, before the call). */
const testCeiling = { costMicros: 100_000n, tokens: 2_000n } as const;

/**
 * ADR-007: a call that belongs to no run is held to the ceiling, unless it is a known call of a
 * project: the options of Plan setup (stage `plan`, with a project to book it to) keep the project's
 * caps and their role's cap. The rule fails closed: a run-less call of any other stage, the Test
 * button included, gets the small ceiling, so a new kind of call cannot spend the project budget
 * before someone decides it may.
 */
export function isCeilinged(request: ProviderSetRequest): boolean {
  const { run } = request;
  if (run.id !== null) return false;
  return !(run.stage === 'plan' && run.projectId !== null);
}

export function providerTestCeiling(cap: UsageCap): bigint {
  if (cap.kind === 'run-cost') return testCeiling.costMicros;
  if (cap.kind === 'run-tokens') return testCeiling.tokens;
  return cap.limit;
}
