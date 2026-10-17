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
import { keyAdditionalData } from '../../src/domain/accounts/provider-keys.js';
import { JsonlEgressLog } from '../../src/infrastructure/guards/jsonl-egress-log.js';
import type { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { JsonlProviderCallLog } from '../../src/infrastructure/providers/jsonl-provider-call-log.js';
import { GuardedProviderFactory } from '../../src/infrastructure/providers/provider-factory.js';
import { AesGcmSecretBox } from '../../src/infrastructure/security/aes-gcm-secret-box.js';
import type { PriceTable } from '../../src/domain/budget/price-table.js';
import { budgetTable } from './budget-harness.js';
import type { FixedClock } from './fixed-clock.js';
import { SpyLedger } from './provider-fakes.js';
import { fixtureSecret, sampleKeyRecord } from './provider-key-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-200, ADR-008: the provider side of an understand run in tests: the real provider factory over
// memory stores, whose one adapter is a FakeProvider replaying a recording. A hook runs before each
// call reaches the fake, so a test can stop the run at a chosen call.

/** Runs before the call with this number (from 1) reaches the fake; the signal is the call's own. */
export type BeforeCall = (call: number, signal: AbortSignal) => Promise<void>;

/** Changes an answer of the recording before the run sees it, by call number (from 1). */
export type DecorateAnswer = (call: number, response: LlmResponse) => LlmResponse;

/** The fake behind every role, with a hook before each call. */
class HookedProvider implements LlmProvider {
  readonly fake: FakeProvider;
  private readonly before: BeforeCall | undefined;
  private readonly decorate: DecorateAnswer | undefined;
  private calls = 0;

  constructor(
    recording: Recording,
    before: BeforeCall | undefined,
    decorate: DecorateAnswer | undefined,
  ) {
    this.fake = new FakeProvider({ testMode: true, recording });
    this.before = before;
    this.decorate = decorate;
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    this.calls += 1;
    await this.before?.(this.calls, request.signal);
    const response = await this.fake.complete(request, observer);
    return this.decorate === undefined ? response : this.decorate(this.calls, response);
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
  readonly decorateAnswer?: DecorateAnswer;
  /** The shipped price table the provider factory uses; the budget harness table by default. */
  readonly priceTable?: PriceTable;
  /** RF-427: the server's OpenAI key (a cloud reader on the server's key). */
  readonly serverOpenAiKey?: string;
  /** RF-427: an OpenAI key of this user's own (a cloud reader on the user's key). */
  readonly ownOpenAiKey?: { readonly userId: string; readonly key: string };
  /** P2-24: an Anthropic key of this user's own. */
  readonly ownAnthropicKey?: { readonly userId: string; readonly key: string };
}

export function understandProviders(parts: UnderstandProviderParts): UnderstandProviders {
  const { dataDir, writer, masker, clock, logger } = parts;
  const adapter = new HookedProvider(parts.recording, parts.beforeCall, parts.decorateAnswer);
  const ledger = new SpyLedger(new MemoryCostLedger());
  const keys = new MemoryProviderKeyRepository();
  const box = new AesGcmSecretBox({ current: fixtureSecret(3) });
  const own = parts.ownOpenAiKey;
  if (own !== undefined) {
    const sealed = box.seal(own.key, keyAdditionalData(own.userId, 'openai'));
    void keys.upsert(sampleKeyRecord(own.userId, 'openai', { sealed, last4: own.key.slice(-4) }));
  }
  const anthropic = parts.ownAnthropicKey;
  if (anthropic !== undefined) {
    const sealed = box.seal(anthropic.key, keyAdditionalData(anthropic.userId, 'anthropic'));
    void keys.upsert(
      sampleKeyRecord(anthropic.userId, 'anthropic', { sealed, last4: anthropic.key.slice(-4) }),
    );
  }
  const factory = new GuardedProviderFactory({
    keys,
    box,
    serverKeys: parts.serverOpenAiKey === undefined ? {} : { openai: parts.serverOpenAiKey },
    // An Ollama provider needs the address (RF-401); the adapter is the fake, so it is never called.
    ollamaUrl: 'http://127.0.0.1:11434',
    serverSettings: new MemoryServerSettings({}),
    ledger,
    priceTable: parts.priceTable ?? budgetTable,
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
