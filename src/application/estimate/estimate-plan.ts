import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import { supportedCards } from '../../domain/planning/plan-sources.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { planInputs, type PlanInputDependencies } from '../plan/plan-inputs.js';
import { planMessage } from '../plan/plan-message.js';
import { ceilPercent } from './estimate-assumptions.js';
import type { ByScenario, Scenario } from './estimate-types.js';
import { planCaps, type PlanCapDependencies } from './plan-caps.js';
import type { PlanEstimate } from './plan-estimate-types.js';
import { estimateRole, type RolePricing } from './role-estimate.js';

// RF-613, ADR-007, DEC-81: the estimate before a plan run (`GET /api/projects/:id/plan-estimate`).
// The plan run makes one planner call (BuildPlan). Its prompt is measured, not guessed: the planner's
// system prompt and the message the run would send (the supported cards and the owner's brief and
// answers in data blocks), at the budget guard's four characters per token. Its output is a share of
// the planner's `maxOutputTokens`; the high figure is all of it, which is the guard's worst case, so
// a high figure that does not fit a cap is a call the guard may refuse (the run ends `CapReached`).
// Cost comes from the price table like the estimate of an understand run; the caps are the ones the
// guard checks (plan-caps.ts).

export interface EstimatePlanDependencies
  extends PlanInputDependencies, RolePricing, PlanCapDependencies {
  /** The principle catalogue the run plans with (RF-606). */
  readonly catalogue: () => Promise<Catalogue>;
  /** The planner's versioned prompt file (RNF-004). */
  readonly prompt: () => Promise<PromptFile>;
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

  // RF-613, RF-1105
  async execute(request: EstimatePlanRequest): Promise<Result<PlanEstimate, EstimatePlanProblem>> {
    const ref = { userId: request.actor.userId, projectId: request.projectId };
    const inputs = await planInputs(this.deps, ref);
    if (!inputs.ok) return err(problemOf(inputs.error.code));
    const { project, cards, brief, questions } = inputs.value;
    const [catalogue, prompt] = await Promise.all([this.deps.catalogue(), this.deps.prompt()]);
    const supported = supportedCards(cards);
    const answered = questions.filter((question) => question.answer.trim() !== '');
    const message = planMessage({ cards: supported, brief, catalogue, answered }, () => TAG);
    // The guard's input estimate: system prompt, messages and the empty tool list `[]`.
    const promptTokens = Math.ceil((prompt.text + message + '[]').length / CHARS_PER_TOKEN);
    const { maxOutputTokens } = project.settings.roles.planner;
    const tokens = eachScenario((scenario) => ({
      inputTokens: promptTokens,
      outputTokens: Math.max(1, ceilPercent(maxOutputTokens, OUTPUT_PERCENT[scenario])),
      cacheWriteTokens: promptTokens,
    }));
    const planner = await estimateRole(this.deps, project, { role: 'planner', tokens });
    const { caps, withinCaps } = await planCaps(this.deps, project, planner);
    return ok({
      priceTableVersion: this.deps.priceTable.version,
      currency: this.deps.priceTable.currency,
      planner,
      assumptions: {
        ...{ calls: 1, promptTokens, maxOutputTokens, outputPercent: OUTPUT_PERCENT },
        ...{ supportedCards: supported.length, answeredQuestions: answered.length },
      },
      caps,
      withinCaps,
    });
  }
}

function problemOf(code: string): EstimatePlanProblem {
  if (code === ERROR_CODES.planBriefMissing || code === ERROR_CODES.planSourceMissing) return code;
  return ERROR_CODES.notFound;
}
