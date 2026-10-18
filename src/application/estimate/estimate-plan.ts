import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import { legacyClaimsOf } from '../../domain/planning/data-model.js';
import { supportedCards } from '../../domain/planning/plan-sources.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { Project } from '../projects/project.js';
import { dataModelMessage } from '../plan/data-model-message.js';
import { planInputs, type PlanInputDependencies } from '../plan/plan-inputs.js';
import { planMessage } from '../plan/plan-message.js';
import { ceilPercent } from './estimate-assumptions.js';
import type { ByScenario, EstimatePoint, RoleEstimate, Scenario } from './estimate-types.js';
import { plannerKeyAvailable, type PlanKeyDependencies } from './plan-key.js';
import { planCaps, type PlanCapDependencies } from './plan-caps.js';
import type { PlanEstimate } from './plan-estimate-types.js';
import { estimateRole, type RolePricing } from './role-estimate.js';

// RF-613, ADR-007, DEC-81: the estimate before a plan run (`GET /api/projects/:id/plan-estimate`).
// The plan run makes up to three planner calls (BuildPlan): the plan, the product requirements
// document (RF-621) and, when the supported cards hold an `ENT` claim, the target data model
// (RF-623). Each prompt is measured, not guessed: the planner's
// system prompt and the message the run would send (the supported cards and the owner's brief and
// answers in data blocks), at the budget guard's four characters per token. Its output is a share of
// the planner's `maxOutputTokens`; the high figure is all of it, which is the guard's worst case, so
// a high figure that does not fit a cap is a call the guard may refuse (the run ends `CapReached`).
// Cost comes from the price table like the estimate of an understand run; the caps are the ones the
// guard checks (plan-caps.ts).

export interface EstimatePlanDependencies
  extends PlanInputDependencies, RolePricing, PlanCapDependencies, PlanKeyDependencies {
  /** The principle catalogue the run plans with (RF-606). */
  readonly catalogue: () => Promise<Catalogue>;
  /** The planner's versioned prompt file (RNF-004). */
  readonly prompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the product requirements document (RF-621). */
  readonly prdPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the target data model (RF-623). */
  readonly dataModelPrompt: () => Promise<PromptFile>;
}

export interface EstimatePlanRequest {
  readonly actor: Actor;
  readonly projectId: string;
}

export type EstimatePlanProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.planBriefMissing
  | typeof ERROR_CODES.planSourceMissing;

/** The planner's package is long: a quarter, half and all of its output limit (RNF-012 calibrates). */
const OUTPUT_PERCENT: ByScenario<number> = { low: 25, likely: 50, high: 100 };
/** The tag of a data block is 24 characters; the run draws its own. */
const TAG = 'a'.repeat(24);
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
    const tokens = eachScenario((scenario) => ({
      inputTokens: promptTokens,
      outputTokens: Math.max(1, ceilPercent(maxOutputTokens, OUTPUT_PERCENT[scenario])),
      cacheWriteTokens: promptTokens,
    }));
    return {
      promptTokens,
      role: await estimateRole(this.deps, project, { role: 'planner', tokens }),
    };
  }

  // RF-613, RF-1105
  async execute(request: EstimatePlanRequest): Promise<Result<PlanEstimate, EstimatePlanProblem>> {
    const ref = { userId: request.actor.userId, projectId: request.projectId };
    const inputs = await planInputs(this.deps, ref);
    if (!inputs.ok) return err(problemOf(inputs.error.code));
    const { project, cards, brief, questions } = inputs.value;
    const [catalogue, prompt, prdPrompt, dataModelPrompt] = await Promise.all([
      this.deps.catalogue(),
      this.deps.prompt(),
      this.deps.prdPrompt(),
      this.deps.dataModelPrompt(),
    ]);
    const supported = supportedCards(cards);
    const answered = questions.filter((question) => question.answer.trim() !== '');
    // The plan and the PRD send the same data blocks; only the system prompt differs.
    const message = planMessage({ cards: supported, brief, catalogue, answered }, () => TAG);
    // RF-623: the data model call is made only when a supported `ENT` claim exists.
    const modelMessage = dataModelMessage({ cards: supported, brief }, () => TAG);
    const prompts = [
      { file: prompt, message },
      { file: prdPrompt, message },
      ...(legacyClaimsOf(supported).length === 0
        ? []
        : [{ file: dataModelPrompt, message: modelMessage }]),
    ];
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
        ...{ calls: calls.length === 3 ? (3 as const) : (2 as const), promptTokens },
        ...{
          prdPromptTokens: calls[1]?.promptTokens ?? 0,
          dataModelPromptTokens: calls[2]?.promptTokens ?? 0,
        },
        ...{ maxOutputTokens, outputPercent: OUTPUT_PERCENT },
        ...{ supportedCards: supported.length, answeredQuestions: answered.length },
      },
      caps,
      withinCaps,
    });
  }
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
