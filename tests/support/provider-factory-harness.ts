import type { CostLedger, LedgerEntry, ReservationRequest } from '../../src/application/ports/cost-ledger.js';
import type { AgentRole, LlmRequest } from '../../src/application/ports/llm-provider.js';
import type {
  ProviderAccount,
  ProviderRun,
  ProviderSetRequest,
  ProviderSinks,
} from '../../src/application/ports/provider-set-factory.js';
import { ManifestSecurityRecorder } from '../../src/application/runs/run-security-record.js';
import type { DefaultRoles } from '../../src/application/projects/default-roles.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import { keyAdditionalData, type KeyProvider } from '../../src/domain/accounts/provider-keys.js';
import type { ServerCaps } from '../../src/domain/budget/budget.js';
import type { CapBreach } from '../../src/domain/budget/usage-cap.js';
import type { Result } from '../../src/domain/errors/result.js';
import type { RosettaError } from '../../src/domain/errors/rosetta-error.js';
import { MemoryCostLedger } from '../../src/infrastructure/db/memory-cost-ledger.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { MemoryRunManifestStore } from '../../src/infrastructure/files/memory-run-manifest-store.js';
import { runPath } from '../../src/infrastructure/files/workspace-paths.js';
import { JsonlEgressLog } from '../../src/infrastructure/guards/jsonl-egress-log.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { MemoryProviderCallLog } from '../../src/infrastructure/providers/memory-provider-call-log.js';
import type { AdapterBuilder, AdapterSpec } from '../../src/infrastructure/providers/adapter-builder.js';
import { GuardedProviderFactory } from '../../src/infrastructure/providers/provider-factory.js';
import { AesGcmSecretBox } from '../../src/infrastructure/security/aes-gcm-secret-box.js';
import { contractRequest, contractScenarios } from '../contracts/llm-provider.contract.js';
import { budgetTable } from './budget-harness.js';
import { recordingOf } from './fake-recordings.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { MemoryOutputWriter } from './memory-output-writer.js';
import { sampleKeyRecord, fixtureSecret } from './provider-key-fixtures.js';
import { templateSettings } from './project-fixtures.js';
import { scopeFor } from './run-event-fixtures.js';
import { sampleManifest } from './run-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-405, RF-407, RF-1104, RF-002, ADR-003: the provider factory over memory adapters. Every
// adapter it builds is a FakeProvider that answers with the contract's text answer; the harness
// keeps the specs it was asked for, the fakes it handed out and what the ledger saw. Generated
// test data only; keys are built from pieces at run time.

export const factoryInstant = '2026-10-12T10:00:00.000Z';

export const factoryAccount: ProviderAccount = {
  id: '00000000-0000-4000-9000-0000000000a1',
  serverKeysAllowed: true,
  dailyCapMicros: null,
  ownDailyCapMicros: null,
};

export const factoryRun: ProviderRun = {
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

export const runScope = scopeFor('20261012-100000-understand', {
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

/** Wraps a ledger and keeps what passed through it. */
export class SpyLedger implements CostLedger {
  readonly reservations: ReservationRequest[] = [];
  readonly entries: LedgerEntry[] = [];
  readonly released: string[] = [];
  private readonly inner: CostLedger;

  constructor(inner: CostLedger) {
    this.inner = inner;
  }

  reserve(request: ReservationRequest): Promise<Result<void, CapBreach>> {
    this.reservations.push(request);
    return this.inner.reserve(request);
  }

  settle(entry: LedgerEntry): Promise<void> {
    this.entries.push(entry);
    return this.inner.settle(entry);
  }

  release(callId: string): Promise<void> {
    this.released.push(callId);
    return this.inner.release(callId);
  }

  runEntries(userId: string, runId: string): Promise<readonly LedgerEntry[]> {
    return this.inner.runEntries(userId, runId);
  }

  purgeExpired(at: Date): Promise<number> {
    return this.inner.purgeExpired(at);
  }
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
}

export interface FactoryHarness {
  readonly factory: GuardedProviderFactory;
  readonly ledger: SpyLedger;
  readonly keys: MemoryProviderKeyRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly logger: MemoryLogger;
  readonly clock: FixedClock;
  readonly sinks: ProviderSinks;
  /** The specs the factory asked the adapter builder for, in order. */
  readonly built: AdapterSpec[];
  /** The fake of each adapter built, by provider name. */
  readonly fakes: Map<string, FakeProvider>;
  /** Every fake handed out, in the order of `built`. */
  readonly fakeList: FakeProvider[];
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

export const answersManyTimes = (): Recording =>
  recordingOf(...Array.from({ length: 6 }, () => contractScenarios.text));

export interface FakeAdapters {
  readonly builder: AdapterBuilder;
  /** The specs the builder was asked for, in order. */
  readonly built: AdapterSpec[];
  readonly fakes: Map<string, FakeProvider>;
  readonly fakeList: FakeProvider[];
}

/** An adapter builder that hands out a FakeProvider per spec, replaying the recording of its name. */
export function fakeAdapters(recordings: Readonly<Record<string, Recording>> = {}): FakeAdapters {
  const built: AdapterSpec[] = [];
  const fakes = new Map<string, FakeProvider>();
  const fakeList: FakeProvider[] = [];
  const builder: AdapterBuilder = (spec) => {
    built.push(spec);
    const fake = new FakeProvider({
      testMode: true,
      recording: recordings[spec.name] ?? answersManyTimes(),
    });
    fakes.set(spec.name, fake);
    fakeList.push(fake);
    return fake;
  };
  return { builder, built, fakes, fakeList };
}

export function factoryHarness(options: FactoryHarnessOptions = {}): FactoryHarness {
  const clock = new FixedClock(factoryInstant);
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const box = new AesGcmSecretBox({ current: fixtureSecret(1) });
  const keys = new MemoryProviderKeyRepository();
  const ledger = new SpyLedger(new MemoryCostLedger());
  const fakeSet = fakeAdapters(options.recordings);
  const { built, fakes, fakeList } = fakeSet;
  const adapters: AdapterBuilder =
    options.adapters === undefined
      ? fakeSet.builder
      : (spec) => {
          built.push(spec);
          return options.adapters?.(spec);
        };
  const serverSettings = new MemoryServerSettings(options.defaultRoles ?? {});
  if (options.caps !== undefined) void serverSettings.saveCaps(options.caps);
  const factory = new GuardedProviderFactory({
    keys,
    box,
    serverKeys: options.serverKeys ?? {},
    ollamaUrl: options.ollamaUrl,
    serverSettings,
    ledger,
    priceTable: budgetTable,
    masker,
    adapters,
    clock,
    ids: new SequenceIdGenerator(),
    logger,
  });

  const calls = new MemoryProviderCallLog(masker);
  const writer = new MemoryOutputWriter();
  const manifests = new MemoryRunManifestStore();
  const stops: RosettaError[] = [];
  const metered: { costMicros: bigint }[] = [];
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
  };
  void manifests.write(runScope, sampleManifest({ runId: runScope.runKey }));
  const egressPath = `${runPath(runScope.projectId, runScope.runKey)}/egress.log.jsonl`;

  return {
    ...{ factory, ledger, keys, serverSettings, logger, clock, sinks, built, fakes, fakeList, calls, stops, metered },
    egressLines: async () => {
      const read = await writer.readText({ userId: runScope.userId, path: egressPath });
      if (!read.ok) return [];
      return read.value
        .split('\n')
        .filter((line) => line !== '')
        .map((line): unknown => JSON.parse(line));
    },
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
      sinks,
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
