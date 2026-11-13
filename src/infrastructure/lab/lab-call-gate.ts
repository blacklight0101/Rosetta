import {
  REFUSED_BEFORE_SENDING,
  type LabCallMeter,
  type MeteredCall,
  type MeteredCase,
} from '../../application/lab/lab-meter.js';
import type { HoldTicket, SpendLedger } from '../../application/lab/spend-ledger.js';
import type { Clock } from '../../application/ports/clock.js';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../application/ports/llm-provider.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-1402, RF-1403, DEC-231, ADR-007, ADR-029: the provider the lab sends its calls through. It
// sits in front of the guarded provider (the egress and budget guards stay innermost, so no call
// bypasses them) and does two things: before each call it holds the call's worst case in the
// shared ledger and refuses the call when a cap or the stop line would be passed (after the first
// refusal it refuses every call), and after each call it books the cost the budget guard priced and
// measures the call for the case's metrics. A call that failed after it was sent may have been billed:
// it is booked at the larger of the cost the guard knows and the worst case held. Only a call refused
// before it was sent releases its hold. When the ledger cannot be written, the invocation stops.

/** Where the cost the budget guard priced for the last call is left (the costs sink writes it). */
export interface CostTap {
  lastCostMicros: number;
}

export interface LabCallGateOptions {
  readonly inner: LlmProvider;
  readonly ledger: SpendLedger;
  /** The most the call can cost, as the budget guard reserves it. */
  readonly worstCaseMicros: (request: LlmRequest) => number;
  readonly tap: CostTap;
  readonly clock: Clock;
}

function codeOf(error: unknown): ErrorCode {
  return error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
}

export class LabCallGate implements LlmProvider, LabCallMeter {
  private readonly options: LabCallGateOptions;
  private calls: MeteredCall[] = [];
  private failures: ErrorCode[] = [];
  private unansweredCostMicros = 0;
  private stopReason: string | undefined;

  constructor(options: LabCallGateOptions) {
    this.options = options;
  }

  begin(): void {
    this.calls = [];
    this.failures = [];
    this.unansweredCostMicros = 0;
  }

  end(): MeteredCase {
    const { calls, failures, unansweredCostMicros } = this;
    return { calls, failures, unansweredCostMicros };
  }

  stopped(): string | undefined {
    return this.stopReason;
  }

  // RF-1402
  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const { ticket, worst } = await this.reserve(request);
    const started = this.options.clock.now().getTime();
    let response: LlmResponse;
    try {
      this.options.tap.lastCostMicros = 0;
      response = await this.options.inner.complete(request, observer);
    } catch (error) {
      await this.afterFailure(ticket, worst, error);
      throw error;
    }
    const costMicros = this.options.tap.lastCostMicros;
    await this.book(ticket, costMicros);
    const latencyMs = this.options.clock.now().getTime() - started;
    this.calls.push(meteredOf(response, latencyMs, costMicros));
    return response;
  }

  /**
   * A call that failed. One a guard refused before sending is released: nothing was billed. Any
   * other may have been billed, so it is booked at the larger of the cost the budget guard knows
   * and the worst case that was held (RF-1402).
   */
  private async afterFailure(ticket: HoldTicket, worst: number, error: unknown): Promise<void> {
    const code = codeOf(error);
    this.failures.push(code);
    if (REFUSED_BEFORE_SENDING.has(code)) {
      await this.release(ticket, error);
      return;
    }
    const booked = Math.max(this.options.tap.lastCostMicros, worst);
    this.unansweredCostMicros += booked;
    await this.book(ticket, booked);
  }

  /** Gives a hold back; the original error stays the one the caller sees, and the ledger error stops the run. */
  private async release(ticket: HoldTicket, original: unknown): Promise<void> {
    try {
      await this.options.ledger.release(ticket);
    } catch (error) {
      const first = original instanceof Error ? original.message : String(original);
      const reason = error instanceof Error ? error.message : String(error);
      this.stopReason = `The ledger could not be written (${reason}) after the call failed (${first}), so the invocation stops.`;
    }
  }

  /** Books the cost of a call that was sent; when the ledger cannot be written, no call follows. */
  private async book(ticket: HoldTicket, micros: number): Promise<void> {
    try {
      await this.options.ledger.settle(ticket, micros);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.stopReason = `The ledger could not be written (${reason}), so the invocation stops: no call may be made that it cannot record.`;
    }
  }

  /** The hold of the call, or a refusal that stops the invocation. */
  private async reserve(request: LlmRequest): Promise<{ ticket: HoldTicket; worst: number }> {
    if (this.stopReason !== undefined) return this.refuse(this.stopReason);
    const worst = this.options.worstCaseMicros(request);
    let held: Awaited<ReturnType<SpendLedger['hold']>>;
    try {
      held = await this.options.ledger.hold(worst);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.stopReason = `The ledger could not be written (${reason}), so the invocation stops: nothing is sent without a hold.`;
      return this.refuse(this.stopReason);
    }
    if (held.ok) return { ticket: held.value, worst };
    this.stopReason = held.error.message;
    return this.refuse(held.error.message);
  }

  private refuse(message: string): never {
    this.failures.push(ERROR_CODES.budgetCapReached);
    throw new RosettaError(ERROR_CODES.budgetCapReached, message);
  }
}

function meteredOf(response: LlmResponse, latencyMs: number, costMicros: number): MeteredCall {
  const { usage } = response;
  return {
    text: response.text,
    ...{ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    ...{ latencyMs, costMicros, modelVersion: response.modelVersion },
  };
}
