import { fileURLToPath } from 'node:url';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { SecretBox } from '../application/ports/secret-box.js';
import type { PriceTable } from '../domain/budget/price-table.js';
import {
  noToolModelsOf,
  reasoningModelsOf,
  type ReasoningModels,
} from '../application/models/model-list.js';
import { loadModelList } from '../infrastructure/models/model-list-file.js';
import type { ProviderSetFactory } from '../application/ports/provider-set-factory.js';
import { TestProviders } from '../application/use-cases/test-providers.js';
import type { Environment } from '../infrastructure/config/environment.js';
import { loadPriceTable } from '../infrastructure/budget/price-file.js';
import type { ModelList } from '../application/models/model-list.js';
import { PgAccountUsage } from '../infrastructure/db/pg-account-usage.js';
import { PgCostLedger } from '../infrastructure/db/pg-cost-ledger.js';
import { PgProviderKeyRepository } from '../infrastructure/db/pg-provider-key-repository.js';
import { PgServerSettings } from '../infrastructure/db/pg-server-settings.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import type { ProjectSettings } from '../application/projects/project-settings.js';
import { loadProjectTemplate } from '../infrastructure/files/project-template.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { realAdapters } from '../infrastructure/providers/adapter-builder.js';
import type { AdapterBuilder } from '../infrastructure/providers/adapter-spec.js';
import { loadTextToolProtocol } from '../infrastructure/providers/ollama/text-tool-protocol-file.js';
import {
  GuardedProviderFactory,
  type GuardedProviderFactoryOptions,
} from '../infrastructure/providers/provider-factory.js';
import { SystemTimeoutSignals } from '../infrastructure/system/system-timeout-signals.js';
import { unrecordedSinks } from '../infrastructure/providers/unrecorded-sinks.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import type { TestDoubles } from './test-doubles.js';

// Architecture section 2 (composition root), ADR-003, ADR-006, ADR-007, RF-405, RF-407, RF-1104:
// the provider factory and the use case behind the Test button. The shipped price table and model
// list are loaded here, at start-up: a missing or invalid file stops the server with RST-1602 instead of pricing a
// call wrong later or showing a wrong list. This file is at the same depth in `src/` and in the built `dist/`, so `../../`
// is the repository root (the image's app folder) from both.
const repositoryRoot = new URL('../../', import.meta.url);
const priceFile = fileURLToPath(new URL('prices/default-prices.yaml', repositoryRoot));
const modelsFile = fileURLToPath(new URL('prices/models.yaml', repositoryRoot));
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

/** Q-58, P3-130: what the shipped list marks (reasoning, no tools); a bad list stops the start-up. */
async function loadModelMarks(): Promise<ModelMarks> {
  const list = await loadModelList(modelsFile);
  return { reasoningModels: reasoningModelsOf(list), toolLessModels: noToolModelsOf(list) };
}

type ModelMarks = Required<
  Pick<GuardedProviderFactoryOptions, 'reasoningModels' | 'toolLessModels'>
>;

/** The adapters of this release, or, in the end-to-end tests, the model double for every kind. */
async function adaptersFor(parts: ProviderParts): Promise<AdapterBuilder> {
  const double = parts.doubles?.provider;
  if (double !== undefined) return () => double;
  return realAdapters({
    testMode: parts.environment.test,
    textProtocolPrompt: (await loadTextToolProtocol(promptsFolder)).text,
    logger: parts.logger,
  });
}

/** What the guarded provider factory needs besides the adapters, which never leave this file. */
export type GuardedFactoryParts = Omit<GuardedProviderFactoryOptions, 'adapters'>;

/** Builds the guarded provider factory of `npm run eval` over its own stores and caps. */
export type GuardedFactoryMaker = (parts: GuardedFactoryParts) => ProviderSetFactory;

/**
 * RNF-006, ADR-003, ADR-007, ADR-008: the provider factory of `npm run eval` over the adapters of
 * this release. The adapters stay inside: what leaves is the guarded factory only, so every model
 * call of the evaluation passes the egress and budget guards with the caps its parts carry.
 */
export async function evaluationProviderFactory(logger: Logger): Promise<GuardedFactoryMaker> {
  const textProtocolPrompt = (await loadTextToolProtocol(promptsFolder)).text;
  const adapters = realAdapters({ testMode: false, textProtocolPrompt, logger });
  const marks = await loadModelMarks();
  return (parts) => new GuardedProviderFactory({ ...parts, adapters, ...marks });
}

export interface ComposedProviders {
  /** The use case behind the Test button (RF-407). */
  readonly testProviders: TestProviders;
  /** The only way a run gets a provider (ADR-003); the understand run uses it (P1-33). */
  readonly factory: ProviderSetFactory;
  /** The shipped price table, loaded once; the run estimate prices the roles with it (RF-425). */
  readonly priceTable: PriceTable;
  /** The shipped model list, loaded once: each model's context window and maximum output (Q-57). */
  readonly models: ModelList;
  /** Q-58: the models the shipped list marks as reasoning models; the estimate names their effort. */
  readonly reasoningModels: ReasoningModels;
  /** The shipped settings template, loaded once: its roles are the built-in default models. */
  readonly template: ProjectSettings;
}

// RF-407
export async function composeProviders(parts: ProviderParts): Promise<ComposedProviders> {
  const { environment, pool, logger, clock, masker, secretBox } = parts;
  const ids = new TimestampIdGenerator(clock);
  const serverSettings = new PgServerSettings(pool);
  const priceTable = await loadPriceTable(priceFile);
  const models = await loadModelList(modelsFile);
  const reasoningModels = reasoningModelsOf(models);
  const factory = new GuardedProviderFactory({
    keys: new PgProviderKeyRepository(pool),
    box: secretBox,
    serverKeys: { openai: environment.openaiApiKey, anthropic: environment.anthropicApiKey },
    ollamaUrl: environment.ollamaUrl,
    serverSettings,
    ledger: new PgCostLedger(pool),
    usage: new PgAccountUsage(pool),
    priceTable,
    models,
    masker,
    adapters: await adaptersFor(parts),
    reasoningModels,
    toolLessModels: noToolModelsOf(models),
    ...{ clock, ids, logger },
  });
  const template = await loadProjectTemplate(templatesFolder);
  const testProviders = new TestProviders({
    users: new PgUserRepository(pool),
    serverSettings,
    template,
    factory,
    ids,
    unrecorded: unrecordedSinks(),
    signals: new SystemTimeoutSignals(),
  });
  return { testProviders, factory, priceTable, models, reasoningModels, template };
}
