import type { BudgetEvents } from '../../application/ports/budget-events.js';
import type { Clock } from '../../application/ports/clock.js';
import type { CostLedger } from '../../application/ports/cost-ledger.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../application/ports/llm-provider.js';
import type { Logger } from '../../application/ports/logger.js';
import type { ProviderCallRecorder } from '../../application/ports/provider-call-recorder.js';
import type { RunCostRecorder } from '../../application/runs/run-cost-record.js';
import { costOf } from '../../domain/budget/price.js';
import type { KeySource } from '../../domain/budget/price-table.js';
import type { CapBreach, UsageCap, WorstCase } from '../../domain/budget/usage-cap.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { ProviderTarget } from '../providers/call-attempts.js';
import { estimateInputTokens } from '../providers/usage-estimate.js';
import {
  ledgerEntryOf,
  noUsage,
  refusedRecord,
  type BudgetCaller,
  type BudgetRun,
  type CallOutcome,
} from './budget-records.js';
import { priceCall, worstCaseOf, type BudgetPricing, type CallPrice } from './budget-pricing.js';

// RF-420..RF-422, RF-427, RF-428, RF-1106, ADR-007, DEC-107, DEC-112: the outermost decorator of
// every provider: BudgetGuard(EgressGuard(ObservedProvider(adapter))) (architecture section 7).
// Outermost, so every call is priced and capped before anything else runs, and no refusal of an
// inner decorator can skip its accounting. For each call, in order:
//   1. it prices the call (RST-1601 for an unpriced model it may not run) and bounds it (RST-1603
//      for a call without an output limit, whose worst case is unknown);
//   2. it reserves the worst case (the whole prompt, estimated at four characters per token, plus
//      the maximum output, priced) against every cap that applies, as one step of the CostLedger;
//      a call that would pass a cap is not made: it is recorded as `refused-by-cap`, the run's
//      signal is aborted with RST-1600 and the refusal is thrown;
//   3. after the call, one ledger row: the reported or estimated usage, priced, with the number of
//      the last attempt; the reservation is deleted in the same step. A call that failed after it
//      was sent is a row without usage; a call never sent (blocked by the egress guard) only frees
//      its reservation. A row that cannot be written fails the call (RST-1604): the answer never
//      reaches the caller unmetered (RF-421).
// It reports to the run's budget events (P1-96, RF-1003): each answered call's ledger row after it
// is written (`usage.recorded` and the warnings) and each cap refusal (`budget.capReached`). A
// reporter that fails is logged; it never fails a call nor changes a refusal or the stop.
// Guarantee: reservations make the check and the claim one step, so in-flight calls can never
// together reserve past a cap. A cap can be passed only by the amount a call's actual usage
// exceeds its reserved worst case; the output never exceeds the reserved maximum, so only the
// input estimate can be short, by at most the in-flight calls' underestimates. The next check sees
// the actual spend and refuses.

export interface BudgetGuardOptions {
  readonly inner: LlmProvider;
  readonly target: ProviderTarget;
  readonly run: BudgetRun;
  readonly keySource: KeySource;
  /** The caps of DEC-107 for this key source (`capsFor`). */
  readonly caps: readonly UsageCap[];
  readonly pricing: BudgetPricing;
  readonly ledger: CostLedger;
  /** The run's call log: a refused call is recorded here with status `refused-by-cap`. */
  readonly recorder: ProviderCallRecorder;
  /** The run's manifest and row totals. */
  readonly costs: RunCostRecorder;
  /** Aborts the run's one signal with the reason (the run ends `CapReached`). */
  readonly stopRun: (reason: RosettaError) => void;
  /** The run's usage and budget events (P1-96); a failure is logged, never thrown. */
  readonly budgetEvents: BudgetEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  /** How long a reservation counts: the call's timeout with its retries, plus a margin. */
  readonly reservationTtlMs: number;
  /** How long the guard waits for the budget events before it goes on (P1-96). */
  readonly reportTimeoutMs: number;
}

/** A call the guard let through: its price and its worst case. */
interface CallPlan {
  readonly price: CallPrice;
  readonly worstCase: WorstCase;
}

const spanIdLength = 16;

export class BudgetGuard implements LlmProvider {
  private readonly options: BudgetGuardOptions;
  private readonly caller: BudgetCaller;

  constructor(options: BudgetGuardOptions) {
    this.options = options;
    const { run, target, keySource } = options;
    this.caller = { run, target, keySource };
  }

  // RF-421, RF-422, RF-428
  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const plan = this.plan(request);
    await this.reserve(request, plan);
    let attempts = 0;
    const counting: LlmAttemptObserver = {
      attemptStarted: () => {
        attempts += 1;
        observer?.attemptStarted();
      },
      attemptRetried: (failure) => observer?.attemptRetried(failure) ?? Promise.resolve(),
    };
    let response: LlmResponse;
    try {
      response = await this.options.inner.complete(request, counting);
    } catch (error) {
      await this.closeFailed(request, plan, attempts);
      throw error;
    }
    await this.settle(request, plan, attempts, response);
    return response;
  }

  /** The call's price and worst case; refused when it has no price or no output limit. */
  private plan(request: LlmRequest): CallPlan {
    const { maxOutputTokens } = request;
    if (maxOutputTokens === undefined) throw new RosettaError(ERROR_CODES.outputLimitMissing);
    const { kind } = this.caller.target;
    const query = { kind, keySource: this.caller.keySource };
    const price = priceCall(this.options.pricing, query, request.model);
    const promptTokens = estimateInputTokens(request);
    return { price, worstCase: worstCaseOf(price.price, { promptTokens, maxOutputTokens }) };
  }

  private async reserve(request: LlmRequest, plan: CallPlan): Promise<void> {
    const { ledger, caps, clock, reservationTtlMs, run, keySource } = this.options;
    const at = clock.now();
    const reservation = {
      callId: request.context.callId,
      userId: run.userId,
      runId: run.id,
      keySource,
      worstCase: plan.worstCase,
      expiresAt: new Date(at.getTime() + reservationTtlMs),
    };
    const reserved = await ledger.reserve({ reservation, caps, at });
    if (!reserved.ok) await this.refuse(request, reserved.error, at);
  }

  /** RF-422: records the refused call, stops the run and throws the refusal. */
  private async refuse(request: LlmRequest, breach: CapBreach, at: Date): Promise<never> {
    const { recorder, ids, logger, stopRun, target } = this.options;
    const refusal = new RosettaError(ERROR_CODES.budgetCapReached);
    const spanId = ids.uuid().replaceAll('-', '').slice(-spanIdLength);
    await this.quietly('The refused call could not be recorded.', request, () =>
      recorder.record(refusedRecord(target, request, { at, spanId })),
    );
    await logger.log({
      level: 'warn',
      logger: 'budget',
      code: ERROR_CODES.budgetCapReached,
      message: `A model call was refused: it could pass the ${breach.kind} cap.`,
      ...this.ids(request),
      data: {
        cap: breach.kind,
        limit: breach.limit.toString(),
        spent: breach.spent.toString(),
        needed: breach.needed.toString(),
      },
    });
    // RF-422: the run's cap event; a reporter that fails changes neither the stop nor the refusal.
    await this.quietly('The cap event could not be published.', request, () =>
      this.options.budgetEvents.capReached(breach),
    );
    stopRun(refusal);
    throw refusal;
  }

  /** RF-421, RF-428: one ledger row for the answered call, before the answer returns. */
  private async settle(
    request: LlmRequest,
    plan: CallPlan,
    attempts: number,
    response: LlmResponse,
  ): Promise<void> {
    const { usage } = response;
    const costMicros = plan.price.price === undefined ? 0n : costOf(plan.price.price, usage).micros;
    const outcome: CallOutcome = { attempt: Math.max(attempts, 1), usage, costMicros };
    const entry = this.entryOf(request, plan, outcome);
    try {
      await this.options.ledger.settle(entry);
    } catch (error) {
      throw new RosettaError(ERROR_CODES.costRecordFailed, undefined, { cause: error });
    }
    const { inputTokens, outputTokens, cachedInputTokens } = usage;
    await this.quietly('The run totals could not be updated.', request, () =>
      this.options.costs.addCall({ inputTokens, outputTokens, cachedInputTokens, costMicros }),
    );
    // RF-1003: the run's usage event, after the row is written; it never fails the call.
    const { caps, budgetEvents } = this.options;
    await this.quietly('The usage event could not be published.', request, () =>
      budgetEvents.callRecorded({ entry, caps }),
    );
  }

  /** A call that failed: a row without usage if it was sent, else its reservation is freed. */
  private async closeFailed(request: LlmRequest, plan: CallPlan, attempts: number): Promise<void> {
    const { ledger } = this.options;
    const outcome: CallOutcome = { attempt: attempts, usage: noUsage, costMicros: 0n };
    await this.quietly('The cost of a failed call could not be recorded.', request, () =>
      attempts === 0
        ? ledger.release({
            callId: request.context.callId,
            userId: this.options.run.userId,
            runId: this.options.run.id,
          })
        : ledger.settle(this.entryOf(request, plan, outcome)),
    );
  }

  private entryOf(request: LlmRequest, plan: CallPlan, outcome: CallOutcome) {
    const at = this.options.clock.now();
    return ledgerEntryOf(this.caller, request, { at, price: plan.price, outcome });
  }

  /** Runs bookkeeping whose failure must not hide the call's own outcome; a failure is logged. */
  private async quietly(
    message: string,
    request: LlmRequest,
    work: () => Promise<void>,
  ): Promise<void> {
    try {
      await work();
    } catch (error) {
      const code = error instanceof RosettaError ? error.code : ERROR_CODES.costRecordFailed;
      await this.options.logger.log({
        level: 'error',
        logger: 'budget',
        code,
        message,
        ...this.ids(request),
      });
    }
  }

  private ids(request: LlmRequest): { runId: string; agentTaskId: string; callId: string } {
    const { runId, agentTaskId, callId } = request.context;
    return { runId, agentTaskId, callId };
  }
}
