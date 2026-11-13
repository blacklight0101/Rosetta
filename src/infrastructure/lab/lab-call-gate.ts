import type { LabCallMeter, MeteredCall, MeteredCase } from '../../application/lab/lab-meter.js';
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
// measures the call for the case's metrics. A call that failed releases its hold: its cost is unknown.

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
  private stopReason: string | undefined;

  constructor(options: LabCallGateOptions) {
    this.options = options;
  }

  begin(): void {
    this.calls = [];
    this.failures = [];
  }

  end(): MeteredCase {
    return { calls: this.calls, failures: this.failures };
  }

  stopped(): string | undefined {
    return this.stopReason;
  }

  // RF-1402
  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const ticket = await this.reserve(request);
    const started = this.options.clock.now().getTime();
    let response: LlmResponse;
    try {
      this.options.tap.lastCostMicros = 0;
      response = await this.options.inner.complete(request, observer);
    } catch (error) {
      await this.options.ledger.release(ticket);
      this.failures.push(codeOf(error));
      throw error;
    }
    const costMicros = this.options.tap.lastCostMicros;
    await this.options.ledger.settle(ticket, costMicros);
    const latencyMs = this.options.clock.now().getTime() - started;
    this.calls.push(meteredOf(response, latencyMs, costMicros));
    return response;
  }

  /** The hold of the call, or a refusal that stops the invocation. */
  private async reserve(request: LlmRequest): Promise<HoldTicket> {
    if (this.stopReason !== undefined) return this.refuse(this.stopReason);
    const held = await this.options.ledger.hold(this.options.worstCaseMicros(request));
    if (held.ok) return held.value;
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
