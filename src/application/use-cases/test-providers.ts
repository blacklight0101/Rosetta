import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { AgentRole, LlmRequest } from '../ports/llm-provider.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type {
  ProviderAccount,
  ProviderSetFactory,
  ProviderSinks,
} from '../ports/provider-set-factory.js';
import type { ServerSettings } from '../ports/server-settings.js';
import type { TimeoutSignals } from '../ports/timeout-signals.js';
import type { UserRepository } from '../ports/user-repository.js';
import { settingsForNewProject } from '../projects/default-settings.js';
import { ROLE_NAMES, type ProjectSettings } from '../projects/project-settings.js';
import type { RoleProvider } from '../providers/provider-set.js';

// RF-407, RF-405, RF-002, ADR-003: the Test button of the settings page. For each role of a new
// project (the template with the server's default models, DEC-106) it sends one tiny call through
// the provider factory, so the call passes the same guards as a run's and is counted in the user's
// ledger (as a row of no run, stage `provider-test`). Each role is then reachable or carries the
// error code; a role that cannot be built (no usable key, provider not offered) is a failed role
// and nothing is called for it. The calls carry a fixed prompt and no repository content, so they
// are made with the consent the button press stands for. The roles run one after another.

const testSystem =
  'You are a connectivity check for a software tool. Answer in as few words as possible.';
const testPrompt = 'Reply with the single word OK.';
/** Small, but enough for a model that spends some of its output on reasoning. */
const testMaxOutputTokens = 64;
/** A test call that has not answered by now is cancelled and shown as failed. */
const testTimeoutMs = 60_000;
const traceIdLength = 32;
const spanIdLength = 16;

export interface RoleTestResult {
  readonly role: AgentRole;
  /** The provider's name in the settings. */
  readonly provider: string;
  readonly model: string;
  readonly status: 'reachable' | 'failed';
  /** The error of a failed role. */
  readonly code?: ErrorCode;
  /** What the role's test call cost, in micro-dollars. */
  readonly costMicros: bigint;
}

export interface TestProvidersDependencies {
  readonly users: UserRepository;
  readonly serverSettings: ServerSettings;
  /** The shipped settings template (`templates/project-settings.json`). */
  readonly template: ProjectSettings;
  readonly factory: ProviderSetFactory;
  readonly ids: IdGenerator;
  /** The limit on a call's time (the cancel signal comes from the infrastructure). */
  readonly signals: TimeoutSignals;
  /** Where a test call's records go: it has no run folder, so they are not kept. */
  readonly unrecorded: Pick<ProviderSinks, 'recorder' | 'egressLog' | 'security'>;
}

export interface TestProvidersRequest {
  readonly actor: Actor;
}

export type TestProvidersProblem = typeof ERROR_CODES.notFound;

export class TestProviders {
  private readonly deps: TestProvidersDependencies;

  constructor(deps: TestProvidersDependencies) {
    this.deps = deps;
  }

  // RF-407
  async execute(
    request: TestProvidersRequest,
  ): Promise<Result<readonly RoleTestResult[], TestProvidersProblem>> {
    const account = await this.deps.users.findById(request.actor.userId);
    if (account === undefined) return err(ERROR_CODES.notFound);
    const settings = settingsForNewProject(
      this.deps.template,
      await this.deps.serverSettings.defaultRoles(),
    );
    const results: RoleTestResult[] = [];
    for (const role of ROLE_NAMES) results.push(await this.testRole(account, settings, role));
    return ok(results);
  }

  private async testRole(
    account: ProviderAccount,
    settings: ProjectSettings,
    role: AgentRole,
  ): Promise<RoleTestResult> {
    const { provider, model } = settings.roles[role];
    const base = { role, provider, model };
    const spent = { micros: 0n };
    const built = await this.deps.factory.build({
      account,
      run: { id: null, userId: account.id, projectId: null, stage: 'provider-test' },
      settings,
      roles: [role],
      cloudConsent: true,
      sinks: {
        ...this.deps.unrecorded,
        costs: {
          addCall: (call) => {
            spent.micros += call.costMicros;
            return Promise.resolve();
          },
        },
        stopRun: () => undefined,
      },
    });
    const chosen = built.ok ? built.value.get(role) : undefined;
    if (!built.ok || chosen === undefined) {
      const code = built.ok
        ? ERROR_CODES.providerUnavailable
        : (built.error[0]?.code ?? ERROR_CODES.providerUnavailable);
      return { ...base, status: 'failed', code, costMicros: 0n };
    }
    const failure = await this.call(chosen, role);
    return {
      ...base,
      status: failure === undefined ? 'reachable' : 'failed',
      ...(failure === undefined ? {} : { code: failure }),
      costMicros: spent.micros,
    };
  }

  /** One tiny call; the code it failed with, or undefined when the model answered. */
  private async call(chosen: RoleProvider, role: AgentRole): Promise<ErrorCode | undefined> {
    const { ids } = this.deps;
    const testId = ids.uuid();
    const compact = ids.uuid().replaceAll('-', '');
    const request: LlmRequest = {
      context: {
        runId: 'provider-test',
        agentTaskId: `provider-test-${role}`,
        role,
        callId: `provider-test-${testId}#1`,
        traceId: compact.padEnd(traceIdLength, '0').slice(0, traceIdLength),
        parentSpanId: compact.slice(-spanIdLength),
      },
      model: chosen.model,
      system: testSystem,
      messages: [{ role: 'user', content: testPrompt }],
      tools: [],
      maxOutputTokens: Math.min(chosen.maxOutputTokens, testMaxOutputTokens),
      signal: this.deps.signals.after(testTimeoutMs),
    };
    try {
      await chosen.provider.complete(request);
      return undefined;
    } catch (error) {
      return error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
    }
  }
}
