import type { Clock } from '../../application/ports/clock.js';
import type {
  LlmAttemptFailure,
  LlmRequest,
  LlmResponse,
  ProviderKind,
  TokenUsage,
} from '../../application/ports/llm-provider.js';
import type {
  ProviderCallRecord,
  ProviderCallStatus,
} from '../../application/ports/provider-call-recorder.js';
import type { Money } from '../../domain/budget/money.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { ProviderCallError } from './provider-call-error.js';

/** The provider a decorator observes, as the provider factory configured it. */
export interface ProviderTarget {
  /** The provider's name in the project settings. */
  readonly provider: string;
  readonly kind: ProviderKind;
  /** Host only, never a URL with a path or query. */
  readonly endpointHost: string;
}

/** The cost of a call's usage (RF-420); the price table of P1-27 provides it. */
export type CallPricer = (call: {
  readonly provider: string;
  readonly model: string;
  readonly usage: TokenUsage;
}) => Money;

export interface CallAttemptsOptions {
  readonly request: LlmRequest;
  readonly target: ProviderTarget;
  readonly clock: Clock;
  readonly spanId: string;
  readonly transcriptRef: string | undefined;
}

const noUsage: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  usageSource: 'estimated',
};

/** What the call log knows about the last attempt of a call that failed for good. */
export function failureOf(error: unknown): LlmAttemptFailure {
  if (error instanceof ProviderCallError) {
    return {
      code: error.code,
      ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
      ...(error.usage === undefined ? {} : { usage: error.usage }),
    };
  }
  if (error instanceof RosettaError) return { code: error.code };
  return { code: ERROR_CODES.providerCallFailed };
}

// RF-408: builds the record of each attempt of one call. Attempts share the call id and span; each
// has its own number, start time and latency (RF-406).
export class CallAttempts {
  private readonly options: CallAttemptsOptions;
  private attempt = 1;
  private startedAt: Date;

  constructor(options: CallAttemptsOptions) {
    this.options = options;
    this.startedAt = options.clock.now();
  }

  started(): void {
    this.startedAt = this.options.clock.now();
  }

  /** The record of the attempt that just failed; the next attempt gets the next number. */
  failed(
    status: Extract<ProviderCallStatus, 'retried' | 'failed'>,
    failure: LlmAttemptFailure,
    cost?: Money,
  ): ProviderCallRecord {
    const latencyMs = this.elapsedMs();
    // Q-60: an attempt that timed out is metered as estimated, not as 0 tokens and $0.00.
    const usage = failure.usage ?? noUsage;
    const record: ProviderCallRecord = {
      ...this.identity(),
      ...(failure.requestId === undefined ? {} : { requestId: failure.requestId }),
      ...this.timing(latencyMs, latencyMs),
      ...usage,
      costMicros: Number(cost?.micros ?? 0n),
      currency: cost?.currency ?? 'USD',
      finishReason: 'error',
      status,
      errorCode: failure.code,
      ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }),
      ...this.link(),
    };
    this.attempt += 1;
    return record;
  }

  /** The record of the attempt that answered. */
  succeeded(response: LlmResponse, cost: Money): ProviderCallRecord {
    const latencyMs = this.elapsedMs();
    const { metrics, usage } = response;
    return {
      ...this.identity(response.modelVersion),
      ...(response.requestId === undefined ? {} : { requestId: response.requestId }),
      ...this.timing(metrics?.timeToFirstTokenMs ?? latencyMs, latencyMs),
      ...usage,
      costMicros: Number(cost.micros),
      currency: cost.currency,
      finishReason: response.finishReason,
      status: 'ok',
      ...(metrics?.httpStatus === undefined ? {} : { httpStatus: metrics.httpStatus }),
      ...(metrics?.ollama === undefined ? {} : { ollama: metrics.ollama }),
      ...this.link(),
    };
  }

  private identity(modelVersion?: string) {
    const { request, target, spanId } = this.options;
    const { context } = request;
    return {
      traceId: context.traceId,
      spanId,
      parentSpanId: context.parentSpanId,
      callId: context.callId,
      attempt: this.attempt,
      runId: context.runId,
      agentTaskId: context.agentTaskId,
      role: context.role,
      provider: target.provider,
      kind: target.kind,
      model: request.model,
      ...(modelVersion === undefined ? {} : { modelVersion }),
      endpointHost: target.endpointHost,
    };
  }

  private timing(timeToFirstTokenMs: number, latencyMs: number) {
    return { startedAt: this.startedAt.toISOString(), timeToFirstTokenMs, latencyMs };
  }

  private link() {
    const { transcriptRef } = this.options;
    return transcriptRef === undefined ? {} : { transcriptRef };
  }

  private elapsedMs(): number {
    return this.options.clock.now().getTime() - this.startedAt.getTime();
  }
}
