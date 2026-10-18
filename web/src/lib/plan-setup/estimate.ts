import type { PlanCap, PlanEstimate } from '../../api/plan-schemas.js';
import type { Project } from '../../api/project-schemas.js';
import { dollars } from '../estimate-math.js';

// RF-613, RF-143, RF-427, RF-1001: what Plan setup works out of the plan estimate. The planner is
// the only role of `plan`. A missing price or a missing key stops the run before its first call, so
// the page blocks "Write the package" with the server's own words; a figure over a cap is a warning
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

export const capName = (cap: PlanCap): string => CAP_NAMES[cap.kind] ?? cap.kind;

/** A cap figure: dollars for a cost cap, a whole number with "tokens" for a token cap. */
export function capFigure(cap: PlanCap, amount: bigint): string {
  return cap.unit === 'micros' ? dollars(amount) : `${amount.toLocaleString('en-US')} tokens`;
}

export const scenarioCost = (estimate: PlanEstimate, scenario: Scenario): string =>
  dollars(estimate.planner[scenario].costMicros);

/** The caps a scenario would pass: a warning, never a block. */
export function overCaps(estimate: PlanEstimate, scenario: Scenario): readonly PlanCap[] {
  return estimate.caps.filter((cap) => !cap.fits[scenario]);
}
