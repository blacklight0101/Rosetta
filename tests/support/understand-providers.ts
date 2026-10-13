import { join } from 'node:path';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/application/ports/llm-provider.js';
import type { Logger } from '../../src/application/ports/logger.js';
import type { OutputWriter } from '../../src/application/ports/output-writer.js';
import type { ProviderSinks } from '../../src/application/ports/provider-set-factory.js';
import type { RunScope } from '../../src/application/ports/run-events.js';
import { MemoryCostLedger } from '../../src/infrastructure/db/memory-cost-ledger.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { runPath } from '../../src/infrastructure/files/workspace-paths.js';
import { JsonlEgressLog } from '../../src/infrastructure/guards/jsonl-egress-log.js';
import type { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { JsonlProviderCallLog } from '../../src/infrastructure/providers/jsonl-provider-call-log.js';
import { GuardedProviderFactory } from '../../src/infrastructure/providers/provider-factory.js';
import { AesGcmSecretBox } from '../../src/infrastructure/security/aes-gcm-secret-box.js';
import { budgetTable } from './budget-harness.js';
import type { FixedClock } from './fixed-clock.js';
import { SpyLedger } from './provider-fakes.js';
import { fixtureSecret } from './provider-key-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-200, ADR-008: the provider side of an understand run in tests: the real provider factory over
// memory stores, whose one adapter is a FakeProvider replaying a recording. A hook runs before each
// call reaches the fake, so a test can stop the run at a chosen call.

/** Runs before the call with this number (from 1) reaches the fake. */
export type BeforeCall = (call: number) => Promise<void>;

/** The fake behind every role, with a hook before each call. */
class HookedProvider implements LlmProvider {
  readonly fake: FakeProvider;
  private readonly before: BeforeCall | undefined;
  private calls = 0;

  constructor(recording: Recording, before: BeforeCall | undefined) {
    this.fake = new FakeProvider({ testMode: true, recording });
    this.before = before;
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    this.calls += 1;
    await this.before?.(this.calls);
    return this.fake.complete(request, observer);
  }
}

export interface UnderstandProviders {
  readonly factory: GuardedProviderFactory;
  readonly ledger: SpyLedger;
  /** The requests the fake received, in order. */
  readonly requests: () => readonly LlmRequest[];
  readonly runSinks: (scope: RunScope) => Pick<ProviderSinks, 'recorder' | 'egressLog'>;
}

export interface UnderstandProviderParts {
  readonly dataDir: string;
  readonly writer: OutputWriter;
  readonly masker: SecretMasker;
  readonly clock: FixedClock;
  readonly logger: Logger;
  readonly recording: Recording;
  readonly beforeCall?: BeforeCall;
}

export function understandProviders(parts: UnderstandProviderParts): UnderstandProviders {
  const { dataDir, writer, masker, clock, logger } = parts;
  const adapter = new HookedProvider(parts.recording, parts.beforeCall);
  const ledger = new SpyLedger(new MemoryCostLedger());
  const factory = new GuardedProviderFactory({
    keys: new MemoryProviderKeyRepository(),
    box: new AesGcmSecretBox({ current: fixtureSecret(3) }),
    serverKeys: {},
    // An Ollama provider needs the address (RF-401); the adapter is the fake, so it is never called.
    ollamaUrl: 'http://127.0.0.1:11434',
    serverSettings: new MemoryServerSettings({}),
    ledger,
    priceTable: budgetTable,
    masker,
    adapters: () => adapter,
    clock,
    ids: new SequenceIdGenerator(),
    logger,
  });
  return {
    factory,
    ledger,
    requests: () => adapter.fake.requests,
    runSinks: (scope) => ({
      recorder: new JsonlProviderCallLog({
        runDir: join(dataDir, 'users', scope.userId, runPath(scope.projectId, scope.runKey)),
        masker,
      }),
      egressLog: new JsonlEgressLog({ writer, masker, scope }),
    }),
  };
}
