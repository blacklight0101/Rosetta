import { fileURLToPath } from 'node:url';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { SecretBox } from '../application/ports/secret-box.js';
import type { PriceTable } from '../domain/budget/price-table.js';
import type { ProviderSetFactory } from '../application/ports/provider-set-factory.js';
import { TestProviders } from '../application/use-cases/test-providers.js';
import type { Environment } from '../infrastructure/config/environment.js';
import { loadPriceTable } from '../infrastructure/budget/price-file.js';
import { PgCostLedger } from '../infrastructure/db/pg-cost-ledger.js';
import { PgProviderKeyRepository } from '../infrastructure/db/pg-provider-key-repository.js';
import { PgServerSettings } from '../infrastructure/db/pg-server-settings.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { loadProjectTemplate } from '../infrastructure/files/project-template.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { realAdapters } from '../infrastructure/providers/adapter-builder.js';
import type { AdapterBuilder } from '../infrastructure/providers/adapter-spec.js';
import { loadTextToolProtocol } from '../infrastructure/providers/ollama/text-tool-protocol-file.js';
import { GuardedProviderFactory } from '../infrastructure/providers/provider-factory.js';
import { SystemTimeoutSignals } from '../infrastructure/system/system-timeout-signals.js';
import { unrecordedSinks } from '../infrastructure/providers/unrecorded-sinks.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import type { TestDoubles } from './test-doubles.js';

// Architecture section 2 (composition root), ADR-003, ADR-006, ADR-007, RF-405, RF-407, RF-1104:
// the provider factory and the use case behind the Test button. The shipped price table is loaded
// here, at start-up: a missing or invalid file stops the server with RST-1602 instead of pricing a
// call wrong later. This file is at the same depth in `src/` and in the built `dist/`, so `../../`
// is the repository root (the image's app folder) from both.
const repositoryRoot = new URL('../../', import.meta.url);
const priceFile = fileURLToPath(new URL('prices/default-prices.yaml', repositoryRoot));
const promptsFolder = fileURLToPath(new URL('prompts/', repositoryRoot));
const templatesFolder = fileURLToPath(new URL('templates/', repositoryRoot));

export interface ProviderParts {
  readonly environment: Pick<
    Environment,
    'openaiApiKey' | 'anthropicApiKey' | 'ollamaUrl' | 'test'
  >;
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly masker: TextMasker;
  /** Opens the user's sealed keys (the only place they are decrypted is the factory). */
  readonly secretBox: SecretBox;
  /** Test mode only: the model double stands in for every adapter (ADR-008). */
  readonly doubles: TestDoubles | undefined;
}

/** The adapters of this release, or, in the end-to-end tests, the model double for every kind. */
async function adaptersFor(parts: ProviderParts): Promise<AdapterBuilder> {
  const double = parts.doubles?.provider;
  if (double !== undefined) return () => double;
  return realAdapters({
    testMode: parts.environment.test,
    textProtocolPrompt: await loadTextToolProtocol(promptsFolder),
    logger: parts.logger,
  });
}

export interface ComposedProviders {
  /** The use case behind the Test button (RF-407). */
  readonly testProviders: TestProviders;
  /** The only way a run gets a provider (ADR-003); the understand run uses it (P1-33). */
  readonly factory: ProviderSetFactory;
  /** The shipped price table, loaded once; the run estimate prices the roles with it (RF-425). */
  readonly priceTable: PriceTable;
}

// RF-407
export async function composeProviders(parts: ProviderParts): Promise<ComposedProviders> {
  const { environment, pool, logger, clock, masker, secretBox } = parts;
  const ids = new TimestampIdGenerator(clock);
  const serverSettings = new PgServerSettings(pool);
  const priceTable = await loadPriceTable(priceFile);
  const factory = new GuardedProviderFactory({
    keys: new PgProviderKeyRepository(pool),
    box: secretBox,
    serverKeys: { openai: environment.openaiApiKey, anthropic: environment.anthropicApiKey },
    ollamaUrl: environment.ollamaUrl,
    serverSettings,
    ledger: new PgCostLedger(pool),
    priceTable,
    masker,
    adapters: await adaptersFor(parts),
    ...{ clock, ids, logger },
  });
  const testProviders = new TestProviders({
    users: new PgUserRepository(pool),
    serverSettings,
    template: await loadProjectTemplate(templatesFolder),
    factory,
    ids,
    unrecorded: unrecordedSinks(),
    signals: new SystemTimeoutSignals(),
  });
  return { testProviders, factory, priceTable };
}
