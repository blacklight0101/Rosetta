import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Project } from '../projects/project.js';
import { planInputs, type PlanInputDependencies } from '../plan/plan-inputs.js';
import { maxPlannerContinuations } from '../plan/plan-continuation.js';
import { reservedWithContinuations } from './plan-continuation-reserve.js';
import { ceilPercent } from './estimate-assumptions.js';
import type { ByScenario, EstimatePoint, RoleEstimate, Scenario } from './estimate-types.js';
import { plannerKeyAvailable, type PlanKeyDependencies } from './plan-key.js';
import {
  plannedPrompts,
  type PlanPromptFiles,
  type PlannedCallKind,
} from './plan-estimate-prompts.js';
import { planCaps, type PlanCapDependencies } from './plan-caps.js';
import type { PlanEstimate } from './plan-estimate-types.js';
import { estimateRole, type RolePricing } from './role-estimate.js';

// RF-613, ADR-007, DEC-81: the estimate before a plan run (`GET /api/projects/:id/plan-estimate`).
// The plan run makes up to six planner calls (BuildPlan): the plan, the product requirements
// document (RF-621), when the supported cards hold an `ENT` claim the target data model (RF-623),
// when they hold a `FLOW` card the target flows (RF-625, whose components block is sized at the
// plan answer's limits, flows-estimate.ts), when the brief names a front end and a `FEAT` or
// `FLOW` card is verified the API contract (RF-624) and, when a `SCRN` card is verified, the
// user-interface material (RF-626). Each prompt is measured, not guessed: the planner's
// system prompt and the message the run would send (the supported cards and the owner's brief and
// answers in data blocks), at the budget guard's four characters per token. Its output is a share of
// the planner's `maxOutputTokens`; the high figure is all of it, which is the guard's worst case, so
// a high figure that does not fit a cap is a call the guard may refuse (the run ends `CapReached`).
// The high figure also reserves the two continuations a cut-off answer may earn (RF-604): three
// answers per call, the input of each continuation holding the answer so far.
// Cost comes from the price table like the estimate of an understand run; the caps are the ones the
// guard checks (plan-caps.ts).

export interface EstimatePlanDependencies
  extends
    PlanInputDependencies,
    RolePricing,
    PlanCapDependencies,
    PlanKeyDependencies,
    PlanPromptFiles {}

export interface EstimatePlanRequest {
  readonly actor: Actor;
  readonly projectId: string;
  /** RF-614: the understand run to plan from, the run's id; the newest completed one when absent. */
  readonly sourceRunId?: string;
}

export type EstimatePlanProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.planBriefMissing
  | typeof ERROR_CODES.planSourceMissing;

/** The planner's package is long: a quarter, half and all of its output limit (RNF-012 calibrates). */
const OUTPUT_PERCENT: ByScenario<number> = { low: 25, likely: 50, high: 100 };
/** The budget guard's estimate: four characters per token. */
const CHARS_PER_TOKEN = 4;

function eachScenario<T>(figure: (scenario: Scenario) => T): ByScenario<T> {
  return { low: figure('low'), likely: figure('likely'), high: figure('high') };
}

export class EstimatePlan {
  private readonly deps: EstimatePlanDependencies;

  constructor(deps: EstimatePlanDependencies) {
    this.deps = deps;
  }

  /** One planner call: its prompt measured as the guard measures it, priced by the role's model. */
  private async callOf(
    project: Project,
    prompt: string,
    maxOutputTokens: number,
  ): Promise<{ readonly promptTokens: number; readonly role: RoleEstimate }> {
    // The guard's input estimate: system prompt, messages and the empty tool list `[]`.
    const promptTokens = Math.ceil((prompt + '[]').length / CHARS_PER_TOKEN);
    const tokens = eachScenario((scenario) => {
      const reserved =
        scenario === 'high' ? reservedWithContinuations(promptTokens, maxOutputTokens) : undefined;
      return {
        inputTokens: reserved?.inputTokens ?? promptTokens,
        outputTokens:
          reserved?.outputTokens ?? ceilPercent(maxOutputTokens, OUTPUT_PERCENT[scenario]),
        cacheWriteTokens: reserved?.inputTokens ?? promptTokens,
      };
    });
    return {
      promptTokens,
      role: await estimateRole(this.deps, project, { role: 'planner', tokens }),
    };
  }

  // RF-613, RF-1105
  async execute(request: EstimatePlanRequest): Promise<Result<PlanEstimate, EstimatePlanProblem>> {
    const ref = { userId: request.actor.userId, projectId: request.projectId };
    const inputs = await planInputs(this.deps, ref, request.sourceRunId);
    if (!inputs.ok) return err(problemOf(inputs.error.code));
    const { project } = inputs.value;
    const planned = await plannedPrompts(this.deps, inputs.value);
    const { calls: prompts } = planned;
    const { maxOutputTokens } = project.settings.roles.planner;
    const calls = await Promise.all(
      prompts.map((each) => this.callOf(project, each.file.text + each.message, maxOutputTokens)),
    );
    const planner = calls.map((call) => call.role).reduce(sumRoles);
    const promptTokens = calls.reduce((sum, call) => sum + call.promptTokens, 0);
    const { caps, withinCaps } = await planCaps(this.deps, project, planner);
    return ok({
      priceTableVersion: this.deps.priceTable.version,
      currency: this.deps.priceTable.currency,
      planner,
      keyAvailable: await plannerKeyAvailable(this.deps, project, planner),
      assumptions: {
        ...{ calls: calls.length, promptTokens },
        ...{
          prdPromptTokens: tokensOf(calls, prompts, 'prd'),
          dataModelPromptTokens: tokensOf(calls, prompts, 'dataModel'),
          flowsPromptTokens: tokensOf(calls, prompts, 'flows'),
          apiContractPromptTokens: tokensOf(calls, prompts, 'apiContract'),
          uxPromptTokens: tokensOf(calls, prompts, 'ux'),
        },
        ...{ maxOutputTokens, outputPercent: OUTPUT_PERCENT },
        continuationsPerCall: maxPlannerContinuations,
        ...{
          supportedCards: planned.supportedCards,
          answeredQuestions: planned.answeredQuestions,
        },
      },
      caps,
      withinCaps,
    });
  }
}

/** The prompt tokens of the call that uses this prompt file; 0 when no such call is made. */
function tokensOf(
  calls: readonly { readonly promptTokens: number }[],
  prompts: readonly { readonly kind: PlannedCallKind }[],
  kind: PlannedCallKind,
): number {
  const at = prompts.findIndex((each) => each.kind === kind);
  return calls[at]?.promptTokens ?? 0;
}

/** Two calls as one figure per scenario: the tokens and the costs of each call added. */
function sumRoles(a: RoleEstimate, b: RoleEstimate): RoleEstimate {
  const add = (scenario: Scenario): EstimatePoint => ({
    inputTokens: a.points[scenario].inputTokens + b.points[scenario].inputTokens,
    outputTokens: a.points[scenario].outputTokens + b.points[scenario].outputTokens,
    costMicros: a.points[scenario].costMicros + b.points[scenario].costMicros,
  });
  return { ...a, points: eachScenario(add) };
}

function problemOf(code: string): EstimatePlanProblem {
  if (code === ERROR_CODES.planBriefMissing || code === ERROR_CODES.planSourceMissing) return code;
  return ERROR_CODES.notFound;
}
