import { NO_LISTED_MODELS } from '../../src/application/models/model-list.js';
import type { ProviderKeyRepository } from '../../src/application/ports/provider-key-repository.js';
import type { SecretBox } from '../../src/application/ports/secret-box.js';
import { TestProviders } from '../../src/application/use-cases/test-providers.js';
import { MemoryCostLedger } from '../../src/infrastructure/db/memory-cost-ledger.js';
import type { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import type { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import type { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { GuardedProviderFactory } from '../../src/infrastructure/providers/provider-factory.js';
import { unrecordedSinks } from '../../src/infrastructure/providers/unrecorded-sinks.js';
import { budgetTable } from './budget-harness.js';
import type { FixedClock } from './fixed-clock.js';
import type { MemoryLogger } from './memory-logger.js';
import { templateSettings } from './project-fixtures.js';
import { FakeTimeoutSignals } from './fake-timeout-signals.js';
import { fakeAdapters, SpyLedger, type FakeAdapters } from './provider-fakes.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-407: the provider test of the test server, over the real factory with fake adapters and the
// memory ledger.

export interface ProviderTestParts {
  readonly users: MemoryUserRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly clock: FixedClock;
  readonly logger: MemoryLogger;
  readonly masker: SecretMasker;
  readonly keys: { readonly keys: ProviderKeyRepository; readonly secretBox: SecretBox };
  readonly recordings?: Readonly<Record<string, Recording>> | undefined;
}

export interface ProviderTestService {
  /** The guarded factory with the fake adapters; Plan setup's options use it too (RF-608). */
  readonly factory: GuardedProviderFactory;
  readonly providers: FakeAdapters;
  readonly providerLedger: SpyLedger;
  readonly testProviders: TestProviders;
}

export function providerTestService(parts: ProviderTestParts): ProviderTestService {
  const { users, serverSettings, clock, logger, masker, keys } = parts;
  const providers = fakeAdapters(parts.recordings);
  const providerLedger = new SpyLedger(new MemoryCostLedger());
  const ids = new SequenceIdGenerator();
  const factory = new GuardedProviderFactory({
    ...{ keys: keys.keys, box: keys.secretBox, serverSettings, clock, ids, logger, masker },
    ...{
      serverKeys: {},
      ollamaUrl: 'http://localhost:11434',
      priceTable: budgetTable,
      models: NO_LISTED_MODELS,
    },
    ledger: providerLedger,
    adapters: providers.builder,
  });
  const template = templateSettings;
  const testProviders = new TestProviders({
    ...{ users, serverSettings, template, factory, ids },
    unrecorded: unrecordedSinks(),
    signals: new FakeTimeoutSignals(),
  });
  return { factory, providers, providerLedger, testProviders };
}
