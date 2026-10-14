import type {
  LlmProvider,
  LlmRequest,
  ProviderKind,
} from '../../src/application/ports/llm-provider.js';
import type { BudgetEvents, RecordedCall } from '../../src/application/ports/budget-events.js';
import type { CostLedger } from '../../src/application/ports/cost-ledger.js';
import type { Price } from '../../src/domain/budget/price.js';
import type { KeySource, PriceTable } from '../../src/domain/budget/price-table.js';
import type { CapBreach, UsageCap } from '../../src/domain/budget/usage-cap.js';
import type { RosettaError } from '../../src/domain/errors/rosetta-error.js';
import { MemoryCostLedger } from '../../src/infrastructure/db/memory-cost-ledger.js';
import { BudgetGuard } from '../../src/infrastructure/guards/budget-guard.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { MemoryProviderCallLog } from '../../src/infrastructure/providers/memory-provider-call-log.js';
import { contractRequest, contractScenarios } from '../contracts/llm-provider.contract.js';
import { recordingOf } from './fake-recordings.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-420..RF-422, RF-428, RF-1106: a BudgetGuard around the fake provider, with the memory ledger,
// a call log and a run whose stop a test can see. Generated test data only.

export const budgetInstant = '2026-10-12T10:00:00.000Z';

export const budgetRun = {
  id: '00000000-0000-4000-b000-0000000000b1',
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
  stage: 'understand',
} as const;

/** The contract request's model, priced so its numbers are easy to follow. */
export const contractPrice: Price = {
  provider: 'openai',
  model: 'contract-model',
  inputPerMillionMicros: 1_000_000n,
  cachedInputPerMillionMicros: 100_000n,
  outputPerMillionMicros: 2_000_000n,
  currency: 'USD',
};

export const budgetTable: PriceTable = {
  version: '2026-10-11',
  currency: 'USD',
  prices: [contractPrice],
};

export interface BudgetHarnessOptions {
  readonly kind?: ProviderKind;
  readonly keySource?: KeySource;
  readonly caps?: readonly UsageCap[];
  readonly overrides?: readonly Price[];
  readonly allowUnpriced?: boolean;
  readonly recording?: Recording;
  /** The provider the guard wraps; the fake of `recording` by default. */
  readonly inner?: LlmProvider;
  readonly ledger?: CostLedger;
  /** Where the guard reports usage and caps; by default a recorder kept in `reported`. */
  readonly budgetEvents?: BudgetEvents;
}

/** What the guard reported to the run's budget events, in order (P1-96). */
interface Reported {
  readonly calls: RecordedCall[];
  readonly caps: CapBreach[];
}

function eventsOf(given: BudgetEvents | undefined, reported: Reported): BudgetEvents {
  return (
    given ?? {
      callRecorded: (call) => {
        reported.calls.push(call);
        return Promise.resolve();
      },
      capReached: (breach) => {
        reported.caps.push(breach);
        return Promise.resolve();
      },
    }
  );
}

interface CostCall {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly costMicros: bigint;
}

export interface BudgetHarness {
  readonly guard: BudgetGuard;
  readonly fake: FakeProvider;
  readonly ledger: CostLedger;
  readonly calls: MemoryProviderCallLog;
  readonly logger: MemoryLogger;
  /** The reasons the guard stopped the run with, in order. */
  readonly stops: RosettaError[];
  /** The calls the guard added to the run's totals. */
  readonly costs: CostCall[];
  readonly reported: Reported;
}

export function budgetHarness(options: BudgetHarnessOptions = {}): BudgetHarness {
  const clock = new FixedClock(budgetInstant);
  const fake = new FakeProvider({
    testMode: true,
    recording: options.recording ?? recordingOf(contractScenarios.text, contractScenarios.text),
  });
  const ledger = options.ledger ?? new MemoryCostLedger();
  const calls = new MemoryProviderCallLog(new SecretMasker());
  const logger = new MemoryLogger(clock, new SecretMasker());
  const stops: RosettaError[] = [];
  const costs: CostCall[] = [];
  const reported: Reported = { calls: [], caps: [] };
  const guard = new BudgetGuard({
    inner: options.inner ?? fake,
    target: { provider: 'main', kind: options.kind ?? 'openai', endpointHost: 'api.openai.com' },
    run: budgetRun,
    keySource: options.keySource ?? 'server',
    caps: options.caps ?? [{ kind: 'run-cost', limit: 1_000_000n }],
    pricing: {
      table: budgetTable,
      overrides: options.overrides ?? [],
      allowUnpriced: options.allowUnpriced ?? false,
    },
    ledger,
    recorder: calls,
    costs: {
      addCall: (call) => {
        costs.push(call);
        return Promise.resolve();
      },
    },
    stopRun: (reason) => stops.push(reason),
    budgetEvents: eventsOf(options.budgetEvents, reported),
    clock,
    ids: new SequenceIdGenerator(),
    logger,
    reservationTtlMs: 600_000,
  });
  return { guard, fake, ledger, calls, logger, stops, costs, reported };
}

/** The contract request with another call id, so parallel calls do not share one. */
export function budgetRequest(callNumber = 1, overrides: Partial<LlmRequest> = {}): LlmRequest {
  const base = contractRequest();
  return {
    ...base,
    context: { ...base.context, callId: `20261012-100000-understand#${String(callNumber)}` },
    ...overrides,
  };
}
