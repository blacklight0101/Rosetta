import type { Clock } from '../../application/ports/clock.js';
import type { CostLedger } from '../../application/ports/cost-ledger.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { AgentRole, LlmProvider } from '../../application/ports/llm-provider.js';
import type { Logger } from '../../application/ports/logger.js';
import type { ProviderKeyRepository } from '../../application/ports/provider-key-repository.js';
import type {
  ProviderProblem,
  ProviderSetFactory,
  ProviderSetRequest,
} from '../../application/ports/provider-set-factory.js';
import type { SecretBox } from '../../application/ports/secret-box.js';
import type { ServerSettings } from '../../application/ports/server-settings.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import { priceOverridesOf } from '../../application/projects/price-overrides.js';
import type { ProviderSet, RoleProvider } from '../../application/providers/provider-set.js';
import { capsFor, type ServerCaps } from '../../domain/budget/budget.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import type { UsageCap } from '../../domain/budget/usage-cap.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { priceCall, type BudgetPricing } from '../guards/budget-pricing.js';
import type { TextMasker } from '../guards/secret-masker.js';
import type { AdapterBuilder } from './adapter-spec.js';
import { guardedProvider } from './guarded-provider.js';
import { resolveAccess, type ProviderAccess, type ServerKeys } from './provider-access.js';
import { reservationLifetimeMs } from './reservation-lifetime.js';

// Architecture sections 2 and 7, ADR-003, ADR-006, ADR-007, ADR-015, RF-405, RF-1104, RF-002: the
// provider factory, the only way to get a provider. For each role asked for it picks the provider
// and model the settings name, chooses the key (the user's own, else the server's where allowed),
// builds the adapter from the one parsed endpoint and wraps it in the guards. A role that cannot be
// served (no usable key, a provider this server does not offer, a cloud model without a price on
// its key, RF-427) is a problem naming the provider; nothing has been called by then.

export interface GuardedProviderFactoryOptions {
  readonly keys: ProviderKeyRepository;
  /** Opens the user's sealed keys; the only decryption of a key in the system. */
  readonly box: SecretBox;
  readonly serverKeys: ServerKeys;
  readonly ollamaUrl: string | undefined;
  readonly serverSettings: ServerSettings;
  readonly ledger: CostLedger;
  /** The shipped price table, loaded at start-up (RF-420). */
  readonly priceTable: PriceTable;
  readonly masker: TextMasker;
  readonly adapters: AdapterBuilder;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

type ProviderConfig = ProjectSettings['providers'][string];
interface WrapParts {
  readonly request: ProviderSetRequest;
  readonly name: string;
  readonly config: ProviderConfig;
  readonly access: ProviderAccess;
  readonly adapter: LlmProvider;
  readonly caps: readonly UsageCap[];
}

/** RF-407: the most one provider test call may cost or use, whoever pays (worst case, before the call). */
const testCeiling = { costMicros: 100_000n, tokens: 2_000n } as const;

function providerTestCeiling(cap: UsageCap): bigint {
  if (cap.kind === 'run-cost') return testCeiling.costMicros;
  if (cap.kind === 'run-tokens') return testCeiling.tokens;
  return cap.limit;
}

export class GuardedProviderFactory implements ProviderSetFactory {
  private readonly options: GuardedProviderFactoryOptions;

  constructor(options: GuardedProviderFactoryOptions) {
    this.options = options;
  }

  // RF-405, RF-1104, RF-002
  async build(
    request: ProviderSetRequest,
  ): Promise<Result<ProviderSet, readonly ProviderProblem[]>> {
    if (request.account.id !== request.run.userId) {
      throw new Error('The account of the request is not the user of its run.');
    }
    const serverCaps = await this.options.serverSettings.caps();
    const set = new Map<AgentRole, RoleProvider>();
    const problems: ProviderProblem[] = [];
    for (const role of request.roles) {
      const built = await this.buildRole(request, role, serverCaps);
      if (built.ok) set.set(role, built.value);
      else problems.push(built.error);
    }
    return problems.length === 0 ? ok(set) : err(problems);
  }

  private async buildRole(
    request: ProviderSetRequest,
    role: AgentRole,
    serverCaps: ServerCaps,
  ): Promise<Result<RoleProvider, ProviderProblem>> {
    const setting = request.settings.roles[role];
    const { provider: name } = setting;
    const fail = (code: ErrorCode): Result<never, ProviderProblem> =>
      err({ role, provider: name, code });
    const config = Object.hasOwn(request.settings.providers, name)
      ? request.settings.providers[name]
      : undefined;
    if (config === undefined) return fail(ERROR_CODES.settingsProviderUnknown);
    const access = await resolveAccess(this.options, {
      userId: request.account.id,
      serverKeysAllowed: request.account.serverKeysAllowed,
      kind: config.kind,
      keySource: config.keySource,
    });
    if (!access.ok) return fail(access.error);
    const adapter = this.adapterFor(name, config, access.value);
    if (!adapter.ok) return fail(adapter.error);
    // RF-427: an unpriced model is refused when the run starts, before its first call.
    if (!this.isPriced(request, config.kind, setting.model, access.value)) {
      return fail(ERROR_CODES.modelUnpriced);
    }
    const caps = this.capsOf(request, access.value, serverCaps);
    const provider = this.wrap({
      request,
      name,
      config,
      access: access.value,
      adapter: adapter.value,
      caps,
    });
    return ok({
      provider,
      name,
      kind: config.kind,
      model: setting.model,
      maxOutputTokens: setting.maxOutputTokens,
      ...(setting.temperature === undefined ? {} : { temperature: setting.temperature }),
      keySource: access.value.keySource,
    });
  }

  /**
   * RF-427: whether the role's model can be priced on its key, so a run with an unpriced cloud model
   * stops before any call; the budget guard checks every call again.
   */
  private isPriced(
    request: ProviderSetRequest,
    kind: ProviderConfig['kind'],
    model: string,
    access: ProviderAccess,
  ): boolean {
    try {
      priceCall(this.pricingOf(request), { kind, keySource: access.keySource }, model);
      return true;
    } catch (error) {
      if (error instanceof RosettaError && error.code === ERROR_CODES.modelUnpriced) return false;
      throw error;
    }
  }

  private pricingOf(request: ProviderSetRequest): BudgetPricing {
    const { budget } = request.settings;
    return {
      table: this.options.priceTable,
      overrides: priceOverridesOf(request.settings),
      allowUnpriced: budget.allowUnpriced,
    };
  }

  /** The adapter for the role; a builder that throws (a key it refuses) is that error's code. */
  private adapterFor(
    name: string,
    config: ProviderConfig,
    access: ProviderAccess,
  ): Result<LlmProvider, ErrorCode> {
    try {
      const adapter = this.options.adapters({
        name,
        kind: config.kind,
        baseUrl: access.endpoint.baseUrl,
        apiKey: access.apiKey,
        timeoutSeconds: config.timeoutSeconds,
        maxRetries: config.maxRetries,
        toolMode: config.toolMode,
        contextTokens: config.contextTokens,
      });
      return adapter === undefined ? err(ERROR_CODES.providerUnavailable) : ok(adapter);
    } catch (error) {
      return err(error instanceof RosettaError ? error.code : ERROR_CODES.providerUnavailable);
    }
  }

  /** Wraps the adapter: BudgetGuard(EgressGuard(ObservedProvider(adapter))). */
  private wrap(parts: WrapParts): LlmProvider {
    const { request, name, config, access } = parts;
    return guardedProvider({
      adapter: parts.adapter,
      target: { provider: name, kind: config.kind, endpointHost: access.endpoint.host },
      run: request.run,
      keySource: access.keySource,
      caps: parts.caps,
      pricing: this.pricingOf(request),
      cloudConsent: request.cloudConsent,
      transcripts: request.settings.output.transcripts,
      reservationTtlMs: reservationLifetimeMs({
        kind: config.kind,
        timeoutSeconds: config.timeoutSeconds,
        maxRetries: config.maxRetries,
      }),
      sinks: request.sinks,
      services: this.options,
    });
  }

  /**
   * DEC-107 caps for the key source. A provider test belongs to no run, so the project budget does
   * not apply: the run caps become the fixed ceiling of one test call (its worst case may not
   * exceed it), so a test of a user key with no daily cap is still bounded.
   */
  private capsOf(
    request: ProviderSetRequest,
    access: ProviderAccess,
    server: ServerCaps,
  ): readonly UsageCap[] {
    const { run } = request.settings.budget;
    const { account } = request;
    const caps = capsFor(access.keySource, {
      run: { maxCostMicros: BigInt(run.maxCostMicros), maxTokens: BigInt(run.maxTokens) },
      server,
      account: {
        dailyCapMicros: account.dailyCapMicros,
        ownDailyCapMicros: account.ownDailyCapMicros,
      },
    });
    if (request.run.id !== null) return caps;
    return caps.map((cap) => ({ ...cap, limit: providerTestCeiling(cap) }));
  }
}
