import { fileURLToPath } from 'node:url';
import { NO_LISTED_MODELS } from '../../src/application/models/model-list.js';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/application/ports/llm-provider.js';
import type { LedgerLimits } from '../../src/application/lab/spend-ledger.js';
import type { Price } from '../../src/domain/budget/price.js';
import type { PriceTable } from '../../src/domain/budget/price-table.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { GuardedProviderFactory } from '../../src/infrastructure/providers/provider-factory.js';
import type { LabParts } from '../../src/presentation/lab/compose-lab.js';
import type { ModelRouter } from './calibration-harness.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { understandSettings } from './understand-run-harness.js';

// RF-1400, RF-1402, ADR-008: `npm run lab` with the fake provider. Each model replays the answers of
// a script behind the real guarded provider factory and the lab's own ledger gate; every call takes
// 250 ms on the test clock. No network and no real model.

export const labFolder = fileURLToPath(new URL('../../lab/', import.meta.url));

/** 400 input and 30 output tokens per answer (the router's usage) cost 460 micro-dollars. */
function priceOf(model: string): Price {
  return {
    ...{ provider: 'fake', model, currency: 'USD' },
    ...{ inputPerMillionMicros: 1_000_000n, outputPerMillionMicros: 2_000_000n },
    cachedInputPerMillionMicros: 0n,
  };
}

const labPrices: PriceTable = {
  version: '2026-11-13',
  currency: 'USD',
  prices: ['model-a', 'model-b'].map(priceOf),
};

export const labLimits: LedgerLimits = {
  totalCapMicros: 50_000_000,
  stopMicros: 40_000_000,
  invocationCapMicros: 5_000_000,
};

export const CALL_COST_MICROS = 460;

class TimedProvider implements LlmProvider {
  private readonly inner: LlmProvider;
  private readonly clock: FixedClock;

  constructor(inner: LlmProvider, clock: FixedClock) {
    this.inner = inner;
    this.clock = clock;
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const answer = await this.inner.complete(request, observer);
    this.clock.advance(250);
    return answer;
  }
}

export interface LabHarnessOptions {
  readonly outputDir: string;
  readonly router: ModelRouter;
  readonly limits?: LedgerLimits;
}

export function labParts(options: LabHarnessOptions): LabParts {
  const clock = new FixedClock('2026-11-13T09:30:00.000Z');
  const masker = new SecretMasker();
  const timed = new TimedProvider(options.router, clock);
  return {
    ...{ outputDir: options.outputDir, promptsFolder: 'prompts' },
    providers: (guards) => new GuardedProviderFactory({ ...guards, adapters: () => timed }),
    serverKeys: {},
    ollamaUrl: undefined,
    priceTable: labPrices,
    models: NO_LISTED_MODELS,
    settings: understandSettings(),
    limits: options.limits ?? labLimits,
    rosettaVersion: '1.2.3-test',
    ...{ clock, ids: new SequenceIdGenerator(), logger: new MemoryLogger(clock, masker), masker },
  };
}

/** `Reason: ...` then the verdict, the form the verifier prompt asks for. */
export const verdict = (word: 'Supported' | 'Rejected'): string =>
  `Reason: The lines settle it.\nVerdict: ${word}`;
