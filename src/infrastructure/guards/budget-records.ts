import type { LedgerEntry } from '../../application/ports/cost-ledger.js';
import type { LlmRequest } from '../../application/ports/llm-provider.js';
import type { ProviderCallRecord } from '../../application/ports/provider-call-recorder.js';
import type { ProviderRun } from '../../application/ports/provider-set-factory.js';
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
    cacheWriteInputTokens: 0,
    usageSource: outcome.usage.usageSource,
    costMicros: outcome.costMicros,
    cacheWriteCostMicros: 0n,
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
