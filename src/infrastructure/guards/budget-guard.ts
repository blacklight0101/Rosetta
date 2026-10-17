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
import { capStopsRun } from '../../domain/budget/cap-stop.js';
import { cacheWriteCostOf, costOf } from '../../domain/budget/price.js';
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
//      signal is aborted with RST-1600 and the refusal is thrown; the cap of a role (RF-423) is
//      the exception: it refuses that role's calls with the same error but leaves the run's
//      signal alone, so the run's other roles go on; so is the summariser's optional step
//      (capStopsRun), whose refusal ends the merge and not the run (P2-35);
//   3. after the call, one ledger row: the reported or estimated usage, priced, with the number of
//      the last attempt; the reservation is deleted in the same step. A call that failed after it
//      was sent is a row without usage; a call never sent (blocked by the egress guard) only frees
//      its reservation. A row that cannot be written fails the call (RST-1604): the answer never
//      reaches the caller unmetered (RF-421).
// It reports to the run's budget events (P1-96, RF-1003): each answered call's ledger row after it
// is written (`usage.recorded` and the warnings) and each cap refusal (`budget.capReached`). A
// reporter that fails, or does not answer within `reportTimeoutMs`, is logged; it never fails or
// holds back a call, nor changes a refusal or the stop.
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

/** The work, or RST-2104 once `limitMs` has passed without it settling (P1-96). */
async function withinTimeLimit(work: Promise<void>, limitMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new RosettaError(ERROR_CODES.runEventLogFailed, 'The budget events did not answer.'));
    }, limitMs);
  });
  try {
    await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

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
      role: request.context.role,
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
    // RF-423: the cap of a role stops that role's calls only; any other cap stops the whole run.
    const roleStop = breach.kind === 'role-cost' || breach.kind === 'role-tokens';
    const reported: CapBreach = roleStop ? { ...breach, role: request.context.role } : breach;
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
        ...(roleStop ? { role: request.context.role } : {}),
        limit: breach.limit.toString(),
        spent: breach.spent.toString(),
        needed: breach.needed.toString(),
      },
    });
    // RF-422: the run's cap event; a reporter that fails changes neither the stop nor the refusal.
    await this.report('The cap event could not be published.', request, () =>
      this.options.budgetEvents.capReached(reported),
    );
    // RF-250: the summariser's step is optional; its refusal never stops the run (P2-35).
    if (!roleStop && capStopsRun(request.context.role)) stopRun(refusal);
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
    const { price } = plan.price;
    const costMicros = price === undefined ? 0n : costOf(price, usage).micros;
    // P2-16: the cache writes' share of the cost, fixed with it; unknown (0) when the cost is.
    const cacheWriteCostMicros = price === undefined ? 0n : cacheWriteCostOf(price, usage).micros;
    const attempt = Math.max(attempts, 1);
    const outcome: CallOutcome = { attempt, usage, costMicros, cacheWriteCostMicros };
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
    await this.report('The usage event could not be published.', request, () =>
      budgetEvents.callRecorded({ entry, caps }),
    );
  }

  /** A call that failed: a row without usage if it was sent, else its reservation is freed. */
  private async closeFailed(request: LlmRequest, plan: CallPlan, attempts: number): Promise<void> {
    const { ledger } = this.options;
    const outcome: CallOutcome = {
      attempt: attempts,
      usage: noUsage,
      costMicros: 0n,
      cacheWriteCostMicros: 0n,
    };
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

  /** P1-96: reports to the budget events, waiting at most `reportTimeoutMs`; a failure is logged. */
  private report(message: string, request: LlmRequest, work: () => Promise<void>): Promise<void> {
    return this.quietly(message, request, () =>
      withinTimeLimit(work(), this.options.reportTimeoutMs),
    );
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
