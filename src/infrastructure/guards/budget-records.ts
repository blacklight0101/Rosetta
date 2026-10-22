import type { LedgerEntry, ReservationKey } from '../../application/ports/cost-ledger.js';
import type { LlmRequest } from '../../application/ports/llm-provider.js';
import type { ProviderCallRecord } from '../../application/ports/provider-call-recorder.js';
import type { ProviderRun } from '../../application/ports/provider-set-factory.js';
import { cacheWriteCostOf, costOf } from '../../domain/budget/price.js';
import type { KeySource } from '../../domain/budget/price-table.js';
import type { TokenUsage } from '../../domain/budget/token-usage.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { ProviderTarget } from '../providers/call-attempts.js';
import type { CallPrice } from './budget-pricing.js';

// RF-408, RF-428, data-model.md sections 3.10 and 3.13: the records the budget guard writes: the
// ledger row of a call that was sent, and the call-log record of a call it refused for a cap.

/** The run a budget guard meters, or the run-less provider test of RF-407. */
export type BudgetRun = ProviderRun;

/** Who pays for the calls of one provider of a run. */
export interface BudgetCaller {
  readonly run: BudgetRun;
  readonly target: ProviderTarget;
  readonly keySource: KeySource;
}

/** What the call used and cost. */
export interface CallOutcome {
  readonly attempt: number;
  readonly usage: TokenUsage & { readonly usageSource: 'reported' | 'estimated' };
  readonly costMicros: bigint;
  /** The part of `costMicros` the cache writes cost (P2-16). */
  readonly cacheWriteCostMicros: bigint;
}

/** The outcome of a call that used this much, priced as an answered call is (RF-421, P2-16). */
export function outcomeOf(
  price: CallPrice,
  attempts: number,
  usage: CallOutcome['usage'],
): CallOutcome {
  const priced = price.price;
  return {
    attempt: Math.max(attempts, 1),
    usage,
    costMicros: priced === undefined ? 0n : costOf(priced, usage).micros,
    cacheWriteCostMicros: priced === undefined ? 0n : cacheWriteCostOf(priced, usage).micros,
  };
}

/** What a call adds to the run's totals. */
export function totalsOf(
  usage: TokenUsage,
  costMicros: bigint,
): Pick<TokenUsage, 'inputTokens' | 'outputTokens' | 'cachedInputTokens'> & {
  readonly costMicros: bigint;
} {
  const { inputTokens, outputTokens, cachedInputTokens } = usage;
  return { inputTokens, outputTokens, cachedInputTokens, costMicros };
}

/** The ledger row of a call (RF-428); a call without an answer has no usage and costs 0. */
// RF-428
export function ledgerEntryOf(
  caller: BudgetCaller,
  request: LlmRequest,
  call: { readonly at: Date; readonly price: CallPrice; readonly outcome: CallOutcome },
): LedgerEntry {
  const { run, target, keySource } = caller;
  const { context } = request;
  const { outcome, price } = call;
  return {
    at: call.at,
    userId: run.userId,
    projectId: run.projectId,
    runId: run.id,
    // data-model.md section 4: a provider test has no agent task.
    agentTaskId: run.stage === 'provider-test' ? null : context.agentTaskId,
    stage: run.stage,
    role: context.role,
    provider: target.provider,
    model: request.model,
    callId: context.callId,
    attempt: outcome.attempt,
    keySource,
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    cachedInputTokens: outcome.usage.cachedInputTokens,
    cacheWriteInputTokens: outcome.usage.cacheWriteInputTokens ?? 0,
    usageSource: outcome.usage.usageSource,
    costMicros: outcome.costMicros,
    cacheWriteCostMicros: outcome.cacheWriteCostMicros,
    costKnown: price.price !== undefined,
    currency: price.price?.currency ?? 'USD',
    priceTableVersion: price.version,
  };
}

/** No usage: an attempt that failed, or a call cancelled before it answered (RF-406). */
export const noUsage: CallOutcome['usage'] = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  usageSource: 'estimated',
};

/** The call-log record of a call refused for a cap: never sent, nothing spent (RF-408). */
// RF-422
export function refusedRecord(
  target: ProviderTarget,
  request: LlmRequest,
  call: { readonly at: Date; readonly spanId: string },
): ProviderCallRecord {
  const { context } = request;
  return {
    traceId: context.traceId,
    spanId: call.spanId,
    parentSpanId: context.parentSpanId,
    callId: context.callId,
    attempt: 1,
    runId: context.runId,
    agentTaskId: context.agentTaskId,
    role: context.role,
    provider: target.provider,
    kind: target.kind,
    model: request.model,
    endpointHost: target.endpointHost,
    startedAt: call.at.toISOString(),
    timeToFirstTokenMs: 0,
    latencyMs: 0,
    ...noUsage,
    costMicros: 0,
    currency: 'USD',
    finishReason: 'error',
    status: 'refused-by-cap',
    errorCode: ERROR_CODES.budgetCapReached,
  };
}

/**
 * Q-60, RF-428: the usage of a call's earlier retried attempts added to its closing usage. Every
 * attempt is metered, so a retried timeout is billed with the call that closes. With nothing
 * earlier the closing usage is returned as it is; the sum is an estimate when one part is.
 */
export function withEarlier(
  closing: CallOutcome['usage'],
  earlier: readonly CallOutcome['usage'][],
): CallOutcome['usage'] {
  if (earlier.length === 0) return closing;
  const all = [closing, ...earlier];
  const sum = (pick: (usage: TokenUsage) => number | undefined): number =>
    all.reduce((total, usage) => total + (pick(usage) ?? 0), 0);
  const cacheWrite = sum((usage) => usage.cacheWriteInputTokens);
  return {
    inputTokens: sum((usage) => usage.inputTokens),
    outputTokens: sum((usage) => usage.outputTokens),
    cachedInputTokens: sum((usage) => usage.cachedInputTokens),
    ...(cacheWrite === 0 ? {} : { cacheWriteInputTokens: cacheWrite }),
    usageSource: all.some((usage) => usage.usageSource === 'estimated') ? 'estimated' : 'reported',
  };
}

/** The reservation of one call of the run (P3-99: renewed while the call runs). */
export function reservationKeyOf(run: BudgetRun, request: LlmRequest): ReservationKey {
  return { callId: request.context.callId, userId: run.userId, runId: run.id };
}
