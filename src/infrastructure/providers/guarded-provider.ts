import type { Clock } from '../../application/ports/clock.js';
import type { CostLedger } from '../../application/ports/cost-ledger.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { LlmProvider } from '../../application/ports/llm-provider.js';
import type { Logger } from '../../application/ports/logger.js';
import type { ProviderSinks } from '../../application/ports/provider-set-factory.js';
import type { KeySource } from '../../domain/budget/price-table.js';
import type { UsageCap } from '../../domain/budget/usage-cap.js';
import { BudgetGuard } from '../guards/budget-guard.js';
import { pricerFor, type BudgetPricing } from '../guards/budget-pricing.js';
import type { BudgetRun } from '../guards/budget-records.js';
import { EgressGuard } from '../guards/egress-guard.js';
import type { TextMasker } from '../guards/secret-masker.js';
import type { ProviderTarget } from './call-attempts.js';
import { ObservedProvider } from './observed-provider.js';

// ADR-003, ADR-006, ADR-007, architecture section 7: the one place an adapter is wrapped:
// BudgetGuard(EgressGuard(ObservedProvider(adapter))). The budget guard is outermost, so every call
// is priced and reserved before anything else runs; the egress guard sits between it and the
// observer, so nothing reaches the adapter unmasked or without the run's consent; the observer is
// innermost and records what the adapter really did. The architecture test
// (tests/integration/tooling/provider-factory-boundary.test.ts) keeps these constructors here.

export interface GuardedParts {
  readonly adapter: LlmProvider;
  readonly target: ProviderTarget;
  readonly run: BudgetRun;
  readonly keySource: KeySource;
  readonly caps: readonly UsageCap[];
  readonly pricing: BudgetPricing;
  /** RF-143: the consent the run recorded. */
  readonly cloudConsent: boolean;
  /** `output.transcripts` (DEC-43). */
  readonly transcripts: boolean;
  readonly reservationTtlMs: number;
  readonly sinks: ProviderSinks;
  readonly services: {
    readonly ledger: CostLedger;
    readonly masker: TextMasker;
    readonly clock: Clock;
    readonly ids: IdGenerator;
    readonly logger: Logger;
  };
}

// ADR-006, ADR-007
export function guardedProvider(parts: GuardedParts): LlmProvider {
  const { adapter, target, run, keySource, caps, pricing, sinks, services } = parts;
  const { ledger, masker, clock, ids, logger } = services;
  const observed = new ObservedProvider({
    inner: adapter,
    recorder: sinks.recorder,
    clock,
    ids,
    target,
    priceCall: pricerFor(pricing, { kind: target.kind, keySource }),
    transcripts: parts.transcripts,
  });
  const egress = new EgressGuard({
    inner: observed,
    target,
    cloudConsent: parts.cloudConsent,
    masker,
    egressLog: sinks.egressLog,
    security: sinks.security,
    logger,
    clock,
  });
  return new BudgetGuard({
    inner: egress,
    ...{ target, run, keySource, caps, pricing, ledger, clock, ids, logger },
    recorder: sinks.recorder,
    costs: sinks.costs,
    stopRun: sinks.stopRun,
    reservationTtlMs: parts.reservationTtlMs,
  });
}
