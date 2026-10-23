import type { AgentRole, LlmRequest } from '../../src/application/ports/llm-provider.js';
import type {
  ProviderAccount,
  ProviderRun,
  ProviderSetRequest,
  ProviderSinks,
} from '../../src/application/ports/provider-set-factory.js';
import type { DefaultRoles } from '../../src/application/projects/default-roles.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import { ManifestSecurityRecorder } from '../../src/application/runs/run-security-record.js';
import { keyAdditionalData, type KeyProvider } from '../../src/domain/accounts/provider-keys.js';
import type { ServerCaps } from '../../src/domain/budget/budget.js';
import type { PriceTable } from '../../src/domain/budget/price-table.js';
import type { RosettaError } from '../../src/domain/errors/rosetta-error.js';
import { MemoryCostLedger } from '../../src/infrastructure/db/memory-cost-ledger.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { MemoryRunManifestStore } from '../../src/infrastructure/files/memory-run-manifest-store.js';
import { runPath } from '../../src/infrastructure/files/workspace-paths.js';
import { JsonlEgressLog } from '../../src/infrastructure/guards/jsonl-egress-log.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { MemoryProviderCallLog } from '../../src/infrastructure/providers/memory-provider-call-log.js';
import type {
  AdapterBuilder,
  AdapterSpec,
} from '../../src/infrastructure/providers/adapter-spec.js';
import {
  GuardedProviderFactory,
  type GuardedProviderFactoryOptions,
} from '../../src/infrastructure/providers/provider-factory.js';
import { AesGcmSecretBox } from '../../src/infrastructure/security/aes-gcm-secret-box.js';
import { contractRequest } from '../contracts/llm-provider.contract.js';
import { NO_LISTED_MODELS, type ModelList } from '../../src/application/models/model-list.js';
import { budgetTable } from './budget-harness.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { MemoryOutputWriter } from './memory-output-writer.js';
import { fakeAdapters, SpyLedger, type FakeAdapters } from './provider-fakes.js';
import { sampleKeyRecord, fixtureSecret } from './provider-key-fixtures.js';
import { templateSettings } from './project-fixtures.js';
import { scopeFor } from './run-event-fixtures.js';
import { sampleManifest } from './run-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { silentBudgetEvents } from '../../src/application/runs/run-budget-events.js';

// RF-405, RF-407, RF-1104, RF-002, ADR-003: the provider factory over memory adapters. Every
// adapter it builds is a FakeProvider that answers with the contract's text answer; the harness
// keeps the specs it was asked for, the fakes it handed out and what the ledger saw. Generated
// test data only; keys are built from pieces at run time.

const factoryInstant = '2026-10-12T10:00:00.000Z';

export const factoryAccount: ProviderAccount = {
  id: '00000000-0000-4000-9000-0000000000a1',
  serverKeysAllowed: true,
  dailyCapMicros: null,
  ownDailyCapMicros: null,
};

const factoryRun: ProviderRun = {
  id: '00000000-0000-4000-b000-0000000000b1',
  userId: factoryAccount.id,
  projectId: '00000000-0000-4000-a000-0000000000c1',
  stage: 'understand',
};

/** A run-less metering context: the provider test of RF-407. */
export const testRun: ProviderRun = {
  id: null,
  userId: factoryAccount.id,
  projectId: null,
  stage: 'provider-test',
};

const runScope = scopeFor('20261012-100000-understand', {
  id: factoryRun.id ?? '',
  userId: factoryAccount.id,
});

/** A server key and a user key the tests recognise, built from pieces. */
export const serverKeyText = ['server', 'key', 'Hq3Tn8', 'KL90'].join('_');
export const userKeyText = ['user', 'key', 'Pw5Zc2', 'MN12'].join('_');

/** A project's settings with these roles; the template's providers cover every kind. */
export function settingsFor(
  roles: Partial<Record<AgentRole, { provider: string; model: string }>>,
): ProjectSettings {
  const base = templateSettings.roles;
  return {
    ...templateSettings,
    roles: {
      reader: { ...base.reader, ...roles.reader },
      verifier: { ...base.verifier, ...roles.verifier },
      planner: { ...base.planner, ...roles.planner },
      summariser: { ...base.summariser, ...roles.summariser },
    },
  };
}

export interface FactoryHarnessOptions {
  readonly serverKeys?: { readonly openai?: string; readonly anthropic?: string };
  readonly ollamaUrl?: string | undefined;
  /** The recording each provider name's fake replays; the text answer, many times, by default. */
  readonly recordings?: Readonly<Record<string, Recording>>;
  /** Replaces the fakes: answers `undefined` for a kind that has no adapter. */
  readonly adapters?: AdapterBuilder;
  readonly caps?: ServerCaps;
  /** The administrator's default models (DEC-106). */
  readonly defaultRoles?: DefaultRoles;
  /** The application log the guards write to; a fresh in-memory one by default. */
  readonly logger?: MemoryLogger;
  /** The shipped price table; `budgetTable` by default. */
  readonly priceTable?: PriceTable;
  /** The shipped model list (Q-57); a list without limits by default. */
  readonly models?: ModelList;
  /** Q-58: which models the shipped list marks as reasoning models; none by default. */
  readonly reasoningModels?: GuardedProviderFactoryOptions['reasoningModels'];
  /** P3-130: which models the shipped list marks as unable to call tools; none by default. */
  readonly toolLessModels?: GuardedProviderFactoryOptions['toolLessModels'];
  /** P3-131: which models the shipped list routes through the Responses API; none by default. */
  readonly responsesModels?: GuardedProviderFactoryOptions['responsesModels'];
}

export interface FactoryHarness extends FakeAdapters {
  readonly factory: GuardedProviderFactory;
  readonly ledger: SpyLedger;
  readonly keys: MemoryProviderKeyRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly logger: MemoryLogger;
  readonly clock: FixedClock;
  readonly sinks: ProviderSinks;
  readonly calls: MemoryProviderCallLog;
  readonly stops: RosettaError[];
  readonly metered: { readonly costMicros: bigint }[];
  /** The lines of the egress log, parsed. */
  readonly egressLines: () => Promise<unknown[]>;
  /** Stores a sealed key of a user, the way SaveProviderKey does. */
  storeKey(userId: string, provider: KeyProvider, plain: string, baseUrl?: string): Promise<void>;
  /** The request for a set built with `build`. */
  request(overrides?: Partial<ProviderSetRequest>): ProviderSetRequest;
}

type RunSinks = Pick<FactoryHarness, 'sinks' | 'calls' | 'stops' | 'metered' | 'egressLines'>;

/** The sinks of one run, kept in memory, with the manifest the security recorder updates. */
function runSinks(masker: SecretMasker): RunSinks {
  const calls = new MemoryProviderCallLog(masker);
  const writer = new MemoryOutputWriter();
  const manifests = new MemoryRunManifestStore();
  const stops: RosettaError[] = [];
  const metered: { costMicros: bigint }[] = [];
  void manifests.write(runScope, sampleManifest({ runId: runScope.runKey }));
  const sinks: ProviderSinks = {
    recorder: calls,
    egressLog: new JsonlEgressLog({ writer, masker, scope: runScope }),
    security: new ManifestSecurityRecorder({ manifests, scope: runScope }),
    costs: {
      addCall: (call) => {
        metered.push({ costMicros: call.costMicros });
        return Promise.resolve();
      },
    },
    stopRun: (reason) => stops.push(reason),
    budgetEvents: silentBudgetEvents,
  };
  const egressPath = `${runPath(runScope.projectId, runScope.runKey)}/egress.log.jsonl`;
  const egressLines = async (): Promise<unknown[]> => {
    const read = await writer.readText({ userId: runScope.userId, path: egressPath });
    if (!read.ok) return [];
    return read.value
      .split('\n')
      .filter((line) => line !== '')
      .map((line): unknown => JSON.parse(line));
  };
  return { sinks, calls, stops, metered, egressLines };
}

/** Q-58, P3-130: the marks of the shipped list the factory is given, when the test gives any. */
function modelMarks(
  options: FactoryHarnessOptions,
): Pick<GuardedProviderFactoryOptions, 'reasoningModels' | 'toolLessModels' | 'responsesModels'> {
  const { reasoningModels, toolLessModels, responsesModels } = options;
  return {
    ...(reasoningModels === undefined ? {} : { reasoningModels }),
    ...(toolLessModels === undefined ? {} : { toolLessModels }),
    ...(responsesModels === undefined ? {} : { responsesModels }),
  };
}

export function factoryHarness(options: FactoryHarnessOptions = {}): FactoryHarness {
  const clock = new FixedClock(factoryInstant);
  const masker = new SecretMasker();
  const logger = options.logger ?? new MemoryLogger(clock, masker);
  const box = new AesGcmSecretBox({ current: fixtureSecret(1) });
  const keys = new MemoryProviderKeyRepository();
  const ledger = new SpyLedger(new MemoryCostLedger());
  const fakes = fakeAdapters(options.recordings);
  const adapters: AdapterBuilder =
    options.adapters === undefined
      ? fakes.builder
      : (spec: AdapterSpec) => {
          fakes.built.push(spec);
          return options.adapters?.(spec);
        };
  const serverSettings = new MemoryServerSettings(options.defaultRoles ?? {});
  if (options.caps !== undefined) void serverSettings.saveCaps(options.caps);
  const factory = new GuardedProviderFactory({
    ...{ keys, box, serverSettings, ledger, masker, adapters, clock, logger },
    serverKeys: options.serverKeys ?? {},
    ollamaUrl: options.ollamaUrl,
    priceTable: options.priceTable ?? budgetTable,
    models: options.models ?? NO_LISTED_MODELS,
    ids: new SequenceIdGenerator(),
    ...modelMarks(options),
  });
  const run = runSinks(masker);
  return {
    ...fakes,
    ...run,
    ...{ factory, ledger, keys, serverSettings, logger, clock },
    storeKey: async (userId, provider, plain, baseUrl) => {
      const base = sampleKeyRecord(userId, provider, {
        sealed: box.seal(plain, keyAdditionalData(userId, provider)),
        last4: plain.slice(-4),
      });
      await keys.upsert(baseUrl === undefined ? base : { ...base, baseUrl });
    },
    request: (overrides = {}) => ({
      account: factoryAccount,
      run: factoryRun,
      settings: templateSettings,
      roles: ['reader'],
      cloudConsent: false,
      sinks: run.sinks,
      ...overrides,
    }),
  };
}

/** The contract request for a role of the harness's run, with its own call id. */
export function callFor(
  role: AgentRole,
  model: string,
  number = 1,
  overrides: Partial<LlmRequest> = {},
): LlmRequest {
  const base = contractRequest();
  return {
    ...base,
    model,
    context: {
      ...base.context,
      role,
      agentTaskId: `${role}-task`,
      callId: `20261012-100000-understand#${role}-${String(number)}`,
    },
    ...overrides,
  };
}

/** The settings with one provider's context size set (`providers.<name>.contextTokens`, DEC-114). */
export function withContextTokens(
  settings: ProjectSettings,
  provider: string,
  contextTokens: 'auto' | number,
): ProjectSettings {
  const existing = settings.providers[provider];
  if (existing === undefined) throw new Error(`The settings define no provider ${provider}.`);
  const providers = { ...settings.providers, [provider]: { ...existing, contextTokens } };
  return { ...settings, providers };
}

/** The settings with one provider's key source changed. */
export function withKeySource(
  settings: ProjectSettings,
  provider: string,
  keySource: 'user' | 'user-then-server',
): ProjectSettings {
  const existing = settings.providers[provider];
  if (existing === undefined) throw new Error(`The settings define no provider ${provider}.`);
  const providers = { ...settings.providers, [provider]: { ...existing, keySource } };
  return { ...settings, providers };
}
