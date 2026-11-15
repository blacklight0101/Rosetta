import type { PlanCap, PlanEstimate } from '../../api/plan-schemas.js';
import type { Project } from '../../api/project-schemas.js';
import { dollars, isLocalModel, tokensText } from '../estimate-math.js';

// RF-613, RF-143, RF-427, RF-1001: what Plan setup works out of the plan estimate. The planner is
// the only role of `plan`. A missing price or a missing key stops the run before its first call, so
// the page blocks "Start the plan" with the server's own words; a figure over a cap is a warning
// because the budget guard stops the run cleanly at the cap. The page reads the figures generically:
// the number of calls behind them is shown only when the server says it.

export type Scenario = 'low' | 'likely' | 'high';

export interface Blocker {
  readonly code: string;
  readonly message: string;
  readonly nextStep: string;
}

const LOCAL_KINDS: readonly string[] = ['ollama', 'fake'];

/** RF-143: a planner that is not a local model sends code off this machine. */
export const needsConsent = (kind: string): boolean => !LOCAL_KINDS.includes(kind);

/** The provider the planner role uses and its kind, from the project's settings. */
export function plannerOfProject(project: Project): {
  readonly provider: string;
  readonly kind: string;
} {
  const { provider } = project.settings.roles.planner;
  return { provider, kind: project.settings.providers[provider]?.kind ?? provider };
}

/** RST-1601 and RST-2302 in the catalogue's words; empty when the run can start. */
// RF-427
export function blockersOf(estimate: PlanEstimate): readonly Blocker[] {
  const found: Blocker[] = [];
  if (!estimate.planner.priced) {
    found.push({
      code: 'RST-1601',
      message: `The planner model ${estimate.planner.model} has no usable price, so it cannot run with these keys.`,
      nextStep:
        'Add a price for the model in the project settings and use your own key, or choose a priced model for the planner.',
    });
  }
  if (!estimate.keyAvailable) {
    found.push({
      code: 'RST-2302',
      message: `There is no API key you may use for ${estimate.planner.provider}.`,
      nextStep:
        'Save your own key for it in Settings and keys, or ask an administrator to allow server keys for your account.',
    });
  }
  return found;
}

const CAP_NAMES: Readonly<Record<string, string>> = {
  'run-cost': 'Run cost cap',
  'run-tokens': 'Run token cap',
  'role-cost': 'Planner cost cap',
  'role-tokens': 'Planner token cap',
  'user-day': 'Your daily cap',
  'server-month': 'Server monthly cap',
  'own-day': 'Your own-key daily cap',
};

/** RF-435, P8-01: the run's line of a journey step is what is left of the approved amount. */
const APPROVED_NAMES: Readonly<Record<string, string>> = {
  'run-cost': 'Approved amount left',
  'run-tokens': 'Approved tokens left',
};

export const capName = (cap: PlanCap): string =>
  (cap.approved ? APPROVED_NAMES[cap.kind] : undefined) ?? CAP_NAMES[cap.kind] ?? cap.kind;

/**
 * RF-435, RF-432, P8-01: one sentence that says which line applies to the plan run: what is left
 * of the journey's approved amount (the run pauses and asks there) or the project run caps (the
 * run ends there).
 */
export function runLineText(estimate: PlanEstimate): string {
  return estimate.runLine === 'journey'
    ? 'This plan runs under what is left of the amount you approved for the journey, not under the project run caps: it pauses and asks before a call that could pass it.'
    : 'This project has no approved journey amount, so the project run caps apply: the run ends at them.';
}

const RUN_CAP_WORDS: Readonly<Record<string, string>> = {
  'run-cost': 'the run cap',
  'run-tokens': 'the run token cap',
};

/**
 * RF-613, P8-01: the warning of a scenario over a cap, with both figures. A figure over the
 * approved amount pauses the run; one over a hard cap can end it, so it "does not fit".
 */
export function overCapText(estimate: PlanEstimate, scenario: Scenario, cap: PlanCap): string {
  const figure = scenarioFigure(estimate, scenario, cap);
  const limit = capFigure(cap, cap.remaining);
  const name = scenario === 'high' ? 'The high estimate' : 'The likely estimate';
  if (cap.approved) {
    return `${name} (${figure}) does not fit what is left of the approved amount (${limit}): the run pauses and asks before it passes it.`;
  }
  const which = RUN_CAP_WORDS[cap.kind] ?? `the ${capName(cap)}`;
  return `${name} (${figure}) does not fit ${which} (${limit} left): the run can stop there before the package is written.`;
}

/** A cap figure: dollars for a cost cap, a whole number with "tokens" for a token cap. */
export function capFigure(cap: PlanCap, amount: bigint): string {
  return cap.unit === 'micros' ? dollars(amount) : `${amount.toLocaleString('en-US')} tokens`;
}

const tokensOfScenario = (estimate: PlanEstimate, scenario: Scenario): bigint =>
  BigInt(estimate.planner[scenario].inputTokens + estimate.planner[scenario].outputTokens);

/** RF-613, Q-44: a local planner is shown in tokens, any other in dollars. */
export function scenarioCost(estimate: PlanEstimate, scenario: Scenario): string {
  return isLocalModel(estimate.planner.kind)
    ? tokensText(tokensOfScenario(estimate, scenario))
    : dollars(estimate.planner[scenario].costMicros);
}

/** The figure of a scenario in the unit of a cap: tokens for a token cap, the cost for a cost cap. */
function scenarioFigure(estimate: PlanEstimate, scenario: Scenario, cap: PlanCap): string {
  return cap.unit === 'tokens'
    ? tokensText(tokensOfScenario(estimate, scenario))
    : dollars(estimate.planner[scenario].costMicros);
}

/**
 * The caps a scenario would pass: a warning, never a block. A local model costs nothing, so a cost
 * cap is never one of them (Q-44).
 */
export function overCaps(estimate: PlanEstimate, scenario: Scenario): readonly PlanCap[] {
  const local = isLocalModel(estimate.planner.kind);
  return estimate.caps.filter((cap) => !cap.fits[scenario] && !(local && cap.unit === 'micros'));
}

/** RF-435, P9-02: the journey's remainder is below the likely plan estimate. */
export interface JourneyShort {
  /** The approved cap the figures are told in; none for a local run that has no approved cap. */
  readonly cap: PlanCap | undefined;
  /** Nothing is left, so "Start the plan" is refused (RST-2311) until Analyse approves more. */
  readonly usedUp: boolean;
  readonly text: string;
}

/** P9-14: "used up" told without a cap: the approved figure in dollars, or in tokens when it has none. */
function usedUpWithoutCap(
  approved: NonNullable<PlanEstimate['journey']>['approved'],
): JourneyShort {
  const figure =
    approved.costMicros > 0n ? dollars(approved.costMicros) : tokensText(approved.tokens);
  const text = `Nothing is left of the ${figure} you approved. The plan cannot start until you approve a new amount.`;
  return { cap: undefined, usedUp: true, text };
}

/**
 * The cap the journey's shortness is told in: the approved cap the likely figure passes, else (the
 * server says the amount is used up) the approved cap of the first unit it has.
 */
function shortCapOf(estimate: PlanEstimate): PlanCap | undefined {
  const over = overCaps(estimate, 'likely').find((each) => each.approved);
  if (over !== undefined || estimate.journey?.usedUp !== true) return over;
  return estimate.caps.find((each) => each.approved);
}

/**
 * RF-435, RF-613, P9-02: what is short of the journey's approved amount, with both figures (the
 * amount approved, which the server gives, and what is left, the approved cap's limit), and the one
 * way on: with something left the plan starts and pauses to Continue (+N); with nothing left only
 * Analyse again on the start page approves a new amount. "Used up" is the server's own rule.
 */
export function journeyShortOf(estimate: PlanEstimate): JourneyShort | undefined {
  const { journey } = estimate;
  const cap = shortCapOf(estimate);
  if (journey === undefined) return undefined;
  // P9-14: a local run has no approved cap, but the server still says the amount is used up.
  if (cap === undefined) return journey.usedUp ? usedUpWithoutCap(journey.approved) : undefined;
  const total = cap.unit === 'tokens' ? journey.approved.tokens : journey.approved.costMicros;
  const approved = capFigure(cap, total);
  const needs = `the plan is estimated at ${scenarioFigure(estimate, 'likely', cap)}`;
  const { usedUp } = journey;
  const text = usedUp
    ? `Nothing is left of the ${approved} you approved, and ${needs}. The plan cannot start until you approve a new amount.`
    : `Only ${capFigure(cap, cap.remaining)} is left of the ${approved} you approved, and ${needs}. You can still start it: the run pauses before it passes what is left and asks you to Continue (+N), which raises the approved amount.`;
  return { cap, usedUp, text };
}
