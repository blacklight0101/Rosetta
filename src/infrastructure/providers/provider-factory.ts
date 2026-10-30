import { roleLimits } from '../../application/models/role-limits.js';
import type { GuardedProviderFactoryOptions } from './provider-factory-options.js';
import type { AgentRole, LlmProvider } from '../../application/ports/llm-provider.js';
import type {
  ProviderProblem,
  ProviderSetFactory,
  ProviderSetRequest,
} from '../../application/ports/provider-set-factory.js';
import {
  DEFAULT_REASONING_EFFORT,
  type ProjectSettings,
} from '../../application/projects/project-settings.js';
import { ownerLogger } from '../../application/runs/owner-logger.js';
import { priceOverridesOf } from '../../application/projects/price-overrides.js';
import { roleBudgetOf } from '../../application/projects/role-budget.js';
import type { ProviderSet, RoleProvider } from '../../application/providers/provider-set.js';
import { capsFor, type ServerCaps } from '../../domain/budget/budget.js';
import type { UsageCap } from '../../domain/budget/usage-cap.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  incompleteOverrideMessage,
  priceCall,
  type BudgetPricing,
} from '../guards/budget-pricing.js';
import { guardedProvider } from './guarded-provider.js';
import { resolveAccess, type ProviderAccess } from './provider-access.js';
import { withRoleEffort, type EffortNote } from './reasoning-effort-provider.js';
import { toolRoleProblem } from './tool-role-problem.js';
import { reservationLifetimeMs } from './reservation-lifetime.js';
import { isCeilinged, providerTestCeiling } from './provider-ceiling.js';
import { scopeStartOf, type ScopeStart } from './scope-spend.js';

// Architecture sections 2 and 7, ADR-003, ADR-006, ADR-007, ADR-015, RF-405, RF-1104, RF-002: the
// provider factory, the only way to get a provider. For each role asked for it picks the provider
// and model the settings name, chooses the key (the user's own, else the server's where allowed),
// builds the adapter from the one parsed endpoint and wraps it in the guards. A role that cannot be
// served (no usable key, a provider this server does not offer, a cloud model without a price on
// its key, RF-427) is a problem naming the provider; nothing has been called by then.

export type { GuardedProviderFactoryOptions } from './provider-factory-options.js';

/** P5-20: the run caps among a role's caps, for the readers' room check. */
function runCapsOf(caps: readonly UsageCap[]): {
  readonly tokens: bigint;
  readonly micros: bigint;
} {
  const limit = (kind: UsageCap['kind']): bigint =>
    caps.find((cap) => cap.kind === kind)?.limit ?? 0n;
  return { tokens: limit('run-tokens'), micros: limit('run-cost') };
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

/** The administrator's caps and what the scope caps have spent when the run starts (P5-18). */
type ScopeCaps = ScopeStart & { readonly server: ServerCaps };

type RoleScope = ScopeCaps & { readonly effortNote: EffortNote };

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
    const wanted = !isCeilinged(request) && request.roles.includes('reader');
    const start = await scopeStartOf(this.options, request, wanted);
    const set = new Map<AgentRole, RoleProvider>();
    const problems: ProviderProblem[] = [];
    const effortNote: EffortNote = {
      noted: false,
      logger: ownerLogger(this.options.logger, request.run.userId),
    };
    for (const role of request.roles) {
      const scope = { server: serverCaps, ...start, effortNote };
      const built =
        toolRoleProblem(this.options.toolLessModels, request.settings, role) ??
        (await this.buildRole(request, role, scope));
      if (built.ok) set.set(role, built.value);
      else problems.push(built.error);
    }
    return problems.length === 0 ? ok(set) : err(problems);
  }

  private async buildRole(
    request: ProviderSetRequest,
    role: AgentRole,
    scope: RoleScope,
  ): Promise<Result<RoleProvider, ProviderProblem>> {
    const setting = request.settings.roles[role];
    const { provider: name } = setting;
    const fail = (code: ErrorCode, message?: string): Result<never, ProviderProblem> =>
      err({ role, provider: name, code, ...(message === undefined ? {} : { message }) });
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
    const unpriced = this.unpricedOf(request, config.kind, setting.model, access.value);
    if (unpriced !== undefined) return fail(ERROR_CODES.modelUnpriced, unpriced.message);
    const limits = roleLimits(request.settings, role, this.options.models);
    const caps = this.capsOf({ request, role }, access.value, scope);
    const guarded = this.wrap({
      request,
      name,
      config,
      access: access.value,
      adapter: adapter.value,
      caps,
    });
    const provider = this.withEffort(guarded, config.kind, setting, scope.effortNote);
    return ok({
      provider,
      name,
      kind: config.kind,
      model: setting.model,
      maxOutputTokens: limits.maxOutputTokens,
      modelContextTokens: limits.modelContextTokens,
      modelMaxOutputTokens: limits.modelMaxOutputTokens,
      ...(setting.temperature === undefined ? {} : { temperature: setting.temperature }),
      keySource: access.value.keySource,
      runCaps: runCapsOf(caps),
    });
  }

  /** Q-58: a model the shipped list marks as a reasoning model sends the role's effort. */
  private withEffort(
    provider: LlmProvider,
    kind: ProviderConfig['kind'],
    setting: ProjectSettings['roles'][AgentRole],
    note: EffortNote,
  ): LlmProvider {
    return withRoleEffort(provider, {
      kind,
      marked: this.options.reasoningModels?.(kind, setting.model) === true,
      responses: this.options.responsesModels?.(kind, setting.model) === true,
      effort: setting.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
      note,
    });
  }

  /**
   * RF-427: undefined when the role's model can be priced on its key; otherwise why not (the message
   * names an override without a cache-write price, P2-24), so a run with an unpriced cloud model
   * stops before any call; the budget guard checks every call again.
   */
  private unpricedOf(
    request: ProviderSetRequest,
    kind: ProviderConfig['kind'],
    model: string,
    access: ProviderAccess,
  ): { readonly message: string | undefined } | undefined {
    const pricing = this.pricingOf(request);
    const query = { kind, keySource: access.keySource };
    try {
      priceCall(pricing, query, model);
      return undefined;
    } catch (error) {
      if (error instanceof RosettaError && error.code === ERROR_CODES.modelUnpriced) {
        return { message: incompleteOverrideMessage(pricing, query, model) };
      }
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
      // RF-1011: the guards' entries name the run's owner, like every other writer of the run.
      services: { ...this.options, logger: ownerLogger(this.options.logger, request.run.userId) },
    });
  }

  /**
   * DEC-107 caps for the key source. A call that belongs to no run, other than the options of Plan
   * setup (a provider test is one), gets the fixed ceiling of one small call in place of the run
   * caps (its worst case may not exceed it), so a test of a user key with no daily cap is still
   * bounded. The options of Plan setup keep the project's caps.
   */
  private capsOf(
    { request, role }: { readonly request: ProviderSetRequest; readonly role: AgentRole },
    access: ProviderAccess,
    { server, scopeSpent, readerRunMicros }: ScopeCaps,
  ): readonly UsageCap[] {
    const { run } = request.settings.budget;
    const caps = capsFor(access.keySource, {
      run: { maxCostMicros: BigInt(run.maxCostMicros), maxTokens: BigInt(run.maxTokens) },
      // RF-423: a call held to the ceiling belongs to no run, so a role's run caps do not apply to it.
      ...(isCeilinged(request) ? {} : { role: roleBudgetOf(request.settings, role) }),
      // RF-429, DEC-193: the readers stop at their share, the verifier at the run cap less the
      // summariser's part, which the summariser keeps.
      reader: role === 'reader' && !isCeilinged(request),
      verifier: role === 'verifier' && !isCeilinged(request),
      ...(scopeSpent === undefined ? {} : { scopeSpent, readerRunMicros }),
      server,
      account: {
        dailyCapMicros: request.account.dailyCapMicros,
        ownDailyCapMicros: request.account.ownDailyCapMicros,
      },
    });
    if (!isCeilinged(request)) return caps;
    return caps.map((cap) => ({ kind: cap.kind, limit: providerTestCeiling(cap) }));
  }
}
