import { randomBytes } from 'node:crypto';
import type { Clock } from '../../src/application/ports/clock.js';
import type { IdGenerator } from '../../src/application/ports/id-generator.js';
import type { Logger } from '../../src/application/ports/logger.js';
import type {
  ProviderSetFactory,
  ProviderSetRequest,
} from '../../src/application/ports/provider-set-factory.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import { silentBudgetEvents } from '../../src/application/runs/run-budget-events.js';
import type { PriceTable } from '../../src/domain/budget/price-table.js';
import { MemoryCostLedger } from '../../src/infrastructure/db/memory-cost-ledger.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import type { AdapterBuilder } from '../../src/infrastructure/providers/adapter-spec.js';
import { GuardedProviderFactory } from '../../src/infrastructure/providers/provider-factory.js';
import { unrecordedSinks } from '../../src/infrastructure/providers/unrecorded-sinks.js';
import { AesGcmSecretBox } from '../../src/infrastructure/security/aes-gcm-secret-box.js';

// ADR-003, ADR-006, ADR-007, P1-47: the spike gets its providers from the guarded provider factory,
// like a run: egress guard, budget guard and observer around the adapter. The stores are in memory
// (no database, no keys: Ollama needs none) and nothing is recorded to a run folder.

export interface SpikeProviderParts {
  readonly adapters: AdapterBuilder;
  /** The Ollama address the roles connect to (`ROSETTA_OLLAMA_URL`). */
  readonly ollamaUrl: string;
  readonly priceTable: PriceTable;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

export function spikeFactory(parts: SpikeProviderParts): ProviderSetFactory {
  const { adapters, ollamaUrl, priceTable, clock, ids, logger } = parts;
  return new GuardedProviderFactory({
    keys: new MemoryProviderKeyRepository(),
    box: new AesGcmSecretBox({ current: randomBytes(32).toString('base64') }),
    serverKeys: {},
    ollamaUrl,
    serverSettings: new MemoryServerSettings({}),
    ledger: new MemoryCostLedger(),
    priceTable,
    // The spike runs on Ollama only, so no model of the shipped list applies (Q-57).
    models: { version: '2026-10-21', models: [] },
    masker: new SecretMasker(),
    adapters,
    ...{ clock, ids, logger },
  });
}

/** The request for the reader role of `settings`: a local run, no cloud consent, nothing kept. */
export function readerRequest(settings: ProjectSettings, runId: string): ProviderSetRequest {
  return {
    account: {
      id: 'spike',
      serverKeysAllowed: false,
      dailyCapMicros: null,
      ownDailyCapMicros: null,
    },
    run: { id: runId, userId: 'spike', projectId: null, stage: 'understand' },
    settings,
    roles: ['reader'],
    cloudConsent: false,
    sinks: {
      ...unrecordedSinks(),
      costs: { addCall: () => Promise.resolve() },
      stopRun: () => undefined,
      budgetEvents: silentBudgetEvents,
    },
  };
}
