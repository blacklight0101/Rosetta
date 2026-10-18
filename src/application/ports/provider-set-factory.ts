import type { User } from '../../domain/accounts/user.js';
import type { ErrorCode } from '../../domain/errors/codes.js';
import type { Result } from '../../domain/errors/result.js';
import type { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { RunStage } from '../../domain/runs/run-states.js';
import type { ProviderSet } from '../providers/provider-set.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import type { RunCostRecorder } from '../runs/run-cost-record.js';
import type { RunSecurityRecorder } from '../runs/run-security-record.js';
import type { BudgetEvents } from './budget-events.js';
import type { EgressLog } from './egress-log.js';
import type { AgentRole } from './llm-provider.js';
import type { ProviderCallRecorder } from './provider-call-recorder.js';

// Architecture sections 2 and 7, ADR-003, ADR-006, ADR-007, ADR-015, RF-405, RF-1104: the only way
// to get a provider. A run (or the provider test) asks for the providers of some roles; the
// factory picks each role's key, wraps every adapter as
// BudgetGuard(EgressGuard(ObservedProvider(adapter))) and answers the problems, one per role that
// cannot be served, before any call is made.

/** The account whose keys and caps a set uses; its id must be the user of the run. */
export type ProviderAccount = Pick<
  User,
  'id' | 'serverKeysAllowed' | 'dailyCapMicros' | 'ownDailyCapMicros'
>;

/**
 * What the ledger books the calls to. A call with a null `id` belongs to no run. A provider test
 * (RF-407) has a null `projectId` too and the stage `provider-test`; the options of Plan setup
 * (RF-608) have a project and the stage `plan`. Only the second keeps the project's caps: any other
 * run-less call is held to the small ceiling of a test call (ADR-007).
 */
export interface ProviderRun {
  /** The run row's UUID; null for a call that belongs to no run. */
  readonly id: string | null;
  readonly userId: string;
  readonly projectId: string | null;
  readonly stage: RunStage | 'provider-test';
}

/** Where a set's decorators record what they see. */
export interface ProviderSinks {
  /** `provider-calls.jsonl` and the transcripts (RF-408). */
  readonly recorder: ProviderCallRecorder;
  /** `egress.log.jsonl` (RF-142). */
  readonly egressLog: EgressLog;
  /** The masked secrets and blocked calls of the manifest (RF-141). */
  readonly security: RunSecurityRecorder;
  /** The totals of the manifest and the run row (RF-421). */
  readonly costs: RunCostRecorder;
  /** Aborts the run's one signal with the reason; the run ends `CapReached` (RF-422). */
  readonly stopRun: (reason: RosettaError) => void;
  /** `usage.recorded`, `budget.warning` and `budget.capReached` of the run (RF-1003). */
  readonly budgetEvents: BudgetEvents;
}

/** The three sinks a call that belongs to no run still writes to (RF-142, RF-408, RF-141). */
export type CallSinks = Pick<ProviderSinks, 'recorder' | 'egressLog' | 'security'>;

export interface ProviderSetRequest {
  readonly account: ProviderAccount;
  readonly run: ProviderRun;
  /** The settings the run recorded: providers, role models, caps, price overrides. */
  readonly settings: ProjectSettings;
  readonly roles: readonly AgentRole[];
  /** RF-143: the consent the run recorded when it was started; nothing in a request can grant it. */
  readonly cloudConsent: boolean;
  readonly sinks: ProviderSinks;
}

/** A role that cannot be served: the provider is named, never a value. */
export interface ProviderProblem {
  readonly role: AgentRole;
  /** The provider's name in the project settings. */
  readonly provider: string;
  readonly code: ErrorCode;
  /** What is wrong, when the code alone does not say it (P2-24); never the value of a key. */
  readonly message?: string;
}

export interface ProviderSetFactory {
  /** The set of the requested roles, or a problem for every role that cannot be served. */
  build(request: ProviderSetRequest): Promise<Result<ProviderSet, readonly ProviderProblem[]>>;
}
