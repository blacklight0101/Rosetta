import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { PlanOptions } from '../../domain/planning/plan-options.js';
import { supportedCards } from '../../domain/planning/plan-sources.js';
import type { Run } from '../../domain/runs/run.js';
import { consentNeedOf } from '../consent/consent-need.js';
import { settleConsent, type StartConsents } from '../consent/start-consent.js';
import type { AgentRole } from '../ports/llm-provider.js';
import type { PromptFile } from '../agent/prompt-file.js';
import {
  recommendPlanOptions,
  type PlanOptionsInput,
  type PlanOptionsProblem,
} from '../planning/recommend-plan-options.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { JourneyRecords } from '../ports/journey-records.js';
import { stepAmountChecked } from '../journey/journey-budget.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { CallSinks, ProviderSetFactory } from '../ports/provider-set-factory.js';
import type { RunCards } from '../ports/run-cards.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { TimeoutSignals } from '../ports/timeout-signals.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { Project } from '../projects/project.js';
import { silentBudgetEvents } from '../runs/run-budget-events.js';
import { scopeOf } from '../runs/run-scope.js';
import { planSourceRun } from '../plan/plan-source.js';

// RF-608, RF-609, RF-143, ADR-003, ADR-007: Plan setup asks Rosetta for its options. From the
// project's newest completed understand run (its verified cards) and newest completed scan (its code
// map) the `planner` role proposes two architecture styles and two options per stack layer
// (`recommendPlanOptions`). The call belongs to no run: it goes through the provider factory like
// every model call, so it is masked and capped, and the ledger books it to the project at stage
// `plan` with no run, the way the Test button of the settings page books its calls (RF-407). It
// carries the consent the person gave on the page, or runs under a consent of the project that holds
// for the planner (DEC-209, P8-81), because the cards and the scan summary leave this machine for a
// cloud provider; a consent it carries is given on the project like a start's. Its egress line, provider-call record and masking counts go to a
// log of the project (`callSinks`), because it has no run folder (RF-142, RF-408).

export interface SuggestPlanOptionsDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly cards: RunCards;
  readonly scans: ScanResults;
  readonly users: UserRepository;
  readonly providers: ProviderSetFactory;
  /** Where the egress line, the provider-call record and the masking counts of a call go. */
  readonly callSinks: (target: {
    readonly userId: string;
    readonly projectId: string;
  }) => CallSinks;
  readonly catalogue: () => Promise<Catalogue>;
  /** `planner/options.v<n>.md`. */
  readonly prompt: () => Promise<PromptFile>;
  readonly ids: Pick<IdGenerator, 'uuid' | 'dataBlockTag'>;
  readonly logger: Logger;
  /** RF-435, P8-01: the journey whose remainder the options call runs under; none: project caps. */
  readonly journeys?: JourneyRecords | undefined;
  /** A call that has not answered by then is cancelled. */
  readonly signals: TimeoutSignals;
  /** The host of the server's Ollama; an Ollama elsewhere counts as a cloud provider (DEC-118). */
  readonly ollamaHost?: string;
  /** DEC-209 (P8-81): the consents of the project, shared with the starts; absent, every call asks. */
  readonly consents?: StartConsents;
}

export interface SuggestPlanOptionsRequest {
  readonly actor: Actor;
  readonly projectId: string;
  /** RF-143: the person's consent to send the cards and the scan summary to a cloud provider. */
  readonly cloudConsent: boolean;
  /** RF-132: the second confirmation, for an uploaded project whose planner uses a cloud provider. */
  readonly privateCodeConfirmed?: boolean;
  /** RF-614: recommend from this understand run (its id); the newest completed one when absent. */
  readonly sourceRunId?: string;
}

const TRACE_ID_LENGTH = 32;
const PLANNER: readonly AgentRole[] = ['planner'];

export class SuggestPlanOptions {
  private readonly deps: SuggestPlanOptionsDependencies;

  constructor(deps: SuggestPlanOptionsDependencies) {
    this.deps = deps;
  }

  // RF-608, RF-609, RF-1105
  async execute(request: SuggestPlanOptionsRequest): Promise<Result<PlanOptions, ErrorCode>> {
    const { actor, projectId } = request;
    const project = await this.deps.projects.find(actor.userId, projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const owner = { userId: actor.userId, projectId };
    const source = await planSourceRun(this.deps.runs, owner, request.sourceRunId);
    if (!source.ok) return err(source.error);
    const understand = source.value;
    const listed = await this.deps.runs.list(actor.userId, projectId);
    const scan = listed.find((run) => run.stage === 'scan' && isCompleted(run));
    const cards = await this.deps.cards.cardsOf(scopeOf(understand));
    if (supportedCards(cards).length === 0) return err(ERROR_CODES.planSourceMissing);
    const codeMap = await this.codeMapOf(scan);
    if (!codeMap.ok) return codeMap;
    // RF-143, RF-132, DEC-209: a consent of the project that holds for the planner stands for the
    // boxes; without one the request must carry them, before the call, and then gives one.
    const consent = await this.consentOf(request, project);
    if (!consent.ok) return err(consent.error);
    const consented = { ...request, cloudConsent: consent.value.cloudConsent };
    return this.ask(consented, project, { cards, codeMap: codeMap.value });
  }

  /** RF-143, RF-132, DEC-209 (P8-81): the consent the options call runs under, as for a plan run. */
  private consentOf(
    request: SuggestPlanOptionsRequest,
    project: Project,
  ): ReturnType<typeof settleConsent> {
    return settleConsent(this.deps.consents, {
      ...{ actor: request.actor, projectId: project.id },
      need: consentNeedOf(project, this.deps.ollamaHost, PLANNER),
      cloudConsent: request.cloudConsent,
      privateCodeConfirmed: request.privateCodeConfirmed === true,
    });
  }

  /** The code map of the scan, or RST-1203 when there is no finished scan or its output is gone. */
  private async codeMapOf(scan: Run | undefined): Promise<Result<CodeMap, ErrorCode>> {
    if (scan === undefined) return err(ERROR_CODES.codeMapMissing);
    try {
      return ok((await this.deps.scans.open(scan)).codeMap);
    } catch (error) {
      if (error instanceof RosettaError) return err(error.code);
      throw error;
    }
  }

  private async ask(
    request: SuggestPlanOptionsRequest,
    project: Project,
    input: Pick<PlanOptionsInput, 'cards' | 'codeMap'>,
  ): Promise<Result<PlanOptions, ErrorCode>> {
    const { deps } = this;
    const account = await deps.users.findById(request.actor.userId);
    if (account === undefined) return err(ERROR_CODES.notFound);
    // RF-435, P9-02: a journey with nothing left refuses the call before it is made, with RST-2311.
    const line = await stepAmountChecked(deps, { userId: account.id, projectId: project.id });
    if (!line.ok) return err(line.error);
    const built = await deps.providers.build({
      account,
      run: { id: null, userId: account.id, projectId: project.id, stage: 'plan' },
      settings: project.settings,
      roles: ['planner'],
      cloudConsent: request.cloudConsent,
      // RF-435, P8-01: the call runs under what is left of the journey's approved amount.
      approvedAmount: line.value,
      sinks: {
        ...deps.callSinks({ userId: account.id, projectId: project.id }),
        costs: { addCall: () => Promise.resolve() },
        stopRun: () => undefined,
        budgetEvents: silentBudgetEvents,
      },
    });
    const planner = built.ok ? built.value.get('planner') : undefined;
    if (!built.ok || planner === undefined) {
      const code = built.ok ? ERROR_CODES.providerUnavailable : built.error[0]?.code;
      return err(code ?? ERROR_CODES.providerUnavailable);
    }
    const [catalogue, prompt] = await Promise.all([deps.catalogue(), deps.prompt()]);
    const callId = deps.ids.uuid();
    const outcome = await recommendPlanOptions(
      {
        ...{ provider: planner.provider, role: planner, prompt, logger: deps.logger },
        ...{
          ids: deps.ids,
          runId: `plan-options-${callId}`,
          nextCallId: () => `plan-options-${callId}#1`,
        },
        traceId: traceIdOf(deps.ids),
        signal: deps.signals.after(callLimitMs(project, planner.name)),
        onAnswer: () => Promise.resolve(),
      },
      { ...input, catalogue },
    );
    return outcome.ok ? outcome : err(journeyWords(outcome.error));
  }
}

/**
 * RF-435, P9-02: a call stopped at the journey's approved line answers RST-2311 (press Analyse
 * again) instead of RST-1600 (raise a cap); a call stopped by any other cap keeps RST-1600.
 */
function journeyWords(problem: PlanOptionsProblem): ErrorCode {
  return problem.approvedLine === true && problem.code === ERROR_CODES.budgetCapReached
    ? ERROR_CODES.journeyAmountUsed
    : problem.code;
}

function traceIdOf(ids: Pick<IdGenerator, 'uuid'>): string {
  return ids.uuid().replaceAll('-', '').padEnd(TRACE_ID_LENGTH, '0').slice(0, TRACE_ID_LENGTH);
}

function isCompleted(run: Run): boolean {
  return run.endState === 'Completed';
}

/**
 * Q-60: a planner call that has not answered by then is cancelled: the timeout of its provider for
 * each attempt it may make. The provider's own timeout ends a stalled attempt sooner; this limit
 * only stops a call that keeps going. A provider the settings do not name has the defaults.
 */
export function callLimitMs(project: Project, providerName: string): number {
  const provider = project.settings.providers[providerName];
  const { timeoutSeconds, maxRetries } = provider ?? { timeoutSeconds: 120, maxRetries: 2 };
  return timeoutSeconds * 1000 * (maxRetries + 1);
}
