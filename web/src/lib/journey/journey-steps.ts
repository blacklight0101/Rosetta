import type { JourneyFacts, JourneyRunFacts } from '../../api/journey-schemas.js';
import { runDownloadPath } from '../../api/runs.js';
import { costLabel } from '../live-run/format.js';
import { nextOf, type JourneyAction, type JourneyLink } from './journey-action.js';
import {
  deepenFirst,
  endText,
  lockReason,
  phaseOf,
  workingText,
  type Context,
  type StepKey,
} from './journey-context.js';

// RF-615, RF-614, DEC-142, DEC-143, RST-1802: the journey from code to package as the page draws it:
// scan, understand, questions, brief, estimate, plan and package, each with its state, the reason it
// is locked or the code it failed with, its cost and its page, and the one step that holds the next
// action. Derived from the facts of the server; nothing is stored. A step whose prerequisites failed
// (an understand run that stopped, one with no Supported claim, a brief that is not saved) is locked
// and has no page, so it is never offered.

/** `current` is the step that holds the next action; `upcoming` is open but not yet reached. */
export type StepState =
  | ('done' | 'current' | 'upcoming' | 'locked' | 'failed' | 'out-of-date')
  /** RF-627: the package was written but some items are built by no task card. */
  | 'gaps';

/** A file or a download a step offers besides its page. */
export interface StepLink {
  readonly label: string;
  readonly href: string;
}

export interface JourneyStep {
  readonly key: StepKey;
  readonly title: string;
  readonly state: StepState;
  /** The reason a step is locked, the code a step failed with, or what the step did. */
  readonly detail: string;
  readonly cost: string;
  /** The page of the step; none for a step the user may not open. */
  readonly href: string | undefined;
  /** Files and downloads of the step, apart from its page; none for most steps. */
  readonly links: readonly StepLink[];
  /** The step that holds the next action, whatever its state. */
  readonly here: boolean;
}

export type { JourneyAction, JourneyLink } from './journey-action.js';
export type { StepKey } from './journey-context.js';

export interface JourneyView {
  readonly steps: readonly JourneyStep[];
  /** The one next action; none while a run works. */
  readonly action: JourneyAction | undefined;
  /** DEC-154: the way to the brief while questions are open; none otherwise. */
  readonly secondary: JourneyLink | undefined;
  readonly totalCostMicros: number;
}

type Draft = Omit<JourneyStep, 'here'>;
type Part = Pick<Draft, 'state' | 'detail'> & {
  readonly href?: string | undefined;
  readonly links?: readonly StepLink[];
};

const NO_COST = 'No cost';
const plural = (count: number, one: string): string =>
  `${String(count)} ${one}${count === 1 ? '' : 's'}`;
const runPage = (run: { readonly id: string }): string => `/runs/${run.id}`;
const locked = (detail: string): Part => ({ state: 'locked', detail });

/** The run's own state as a step: failed with its code, or working. */
function ofRun(run: JourneyRunFacts, completed: Part): Part {
  const phase = phaseOf(run);
  if (phase === 'completed') return completed;
  if (phase === 'working')
    return { state: 'upcoming', detail: workingText(run), href: runPage(run) };
  return { state: 'failed', detail: endText(run), href: runPage(run) };
}

function scanPart({ source, facts }: Context): Part {
  if (source === null) return { state: 'upcoming', detail: 'Start a run to map the code' };
  const href = facts.scanRunId === null ? undefined : `/runs/${facts.scanRunId}`;
  return { state: 'done', detail: 'Code map ready', href };
}

function understandPart({ source }: Context): Part {
  if (source === null) return locked('Needs a run: start one');
  const claims = source.supportedClaims;
  const detail =
    claims === 0 ? 'No Supported claim to plan from' : plural(claims, 'Supported claim');
  return ofRun(source, { state: 'done', detail, href: runPage(source) });
}

function questionsPart({ source, facts, skippedDeepen: skipped }: Context): Part {
  if (source === null) return locked('Needs an understand run');
  const phase = phaseOf(source);
  if (phase === 'working') return locked('Comes after the run finishes');
  if (phase === 'stopped') return locked('Resume the run first');
  // RF-615 (Q-49): no Supported claim, no question to answer: locked like the steps after it.
  const nothing = lockReason(source);
  if (nothing !== undefined) return locked(nothing);
  const open = source.openQuestions;
  const href = runPage(source);
  if (open === 0) return { state: 'done', detail: 'No open questions', href };
  // RF-615 (Q-44): a saved brief moves the journey on; the skipped questions keep their defaults.
  if (facts.briefSaved) {
    const left =
      open === 1
        ? '1 question left on its default'
        : `${String(open)} questions left on their defaults`;
    return { state: 'done', detail: left, href };
  }
  // RF-646, DEC-179: the questions come after the last Deepen; answers given now will be used by it.
  if (deepenFirst({ source, skippedDeepen: skipped })) {
    const detail = `${plural(open, 'open question')}, asked after the last Deepen: answers given now will be used by it`;
    return { state: 'upcoming', detail, href };
  }
  return { state: 'upcoming', detail: plural(open, 'open question'), href };
}

function briefPart(c: Context): Part {
  const reason = lockReason(c.source);
  if (reason !== undefined) return locked(reason);
  if (!c.facts.briefSaved) return { state: 'upcoming', detail: 'Not saved yet', href: c.setUp };
  return { state: 'done', detail: 'Brief saved', href: c.setUp };
}

/** A package written earlier no longer matches the brief or the source run: a new estimate is due. */
const needsNewEstimate = ({ facts, plan }: Context): boolean =>
  facts.handoff?.outOfDate === true && plan !== null && phaseOf(plan) === 'completed';

function estimatePart(c: Context): Part {
  const reason = lockReason(c.source);
  if (reason !== undefined) return locked(reason);
  if (!c.facts.briefSaved) return locked('Needs the saved brief');
  if (c.plan === null) {
    return { state: 'upcoming', detail: 'Shown before you write the package', href: c.setUp };
  }
  if (needsNewEstimate(c)) {
    return { state: 'upcoming', detail: 'A new estimate is needed', href: c.setUp };
  }
  return { state: 'done', detail: 'Confirmed before the plan ran', href: c.setUp };
}

function planPart(c: Context): Part {
  const reason = lockReason(c.source);
  if (reason !== undefined) return locked(reason);
  if (!c.facts.briefSaved) return locked('Needs the saved brief');
  if (c.plan === null) return { state: 'upcoming', detail: 'Starts when you write the package' };
  return ofRun(c.plan, { state: 'done', detail: 'Completed', href: runPage(c.plan) });
}

function lockedPackage({ plan }: Context): Part {
  if (plan === null) return locked('Written by the plan');
  return locked(
    phaseOf(plan) === 'working' ? 'Written when the plan finishes' : 'The plan did not finish',
  );
}

/** RF-627: the package of a plan run that ended RST-1806, never reported as complete. */
function gapsPart(runId: string): Part {
  return {
    state: 'gaps',
    detail: 'Written with gaps',
    href: runPage({ id: runId }),
    links: [
      { label: 'checks.md', href: `/runs/${runId}/files/handoff/checks.md` },
      { label: 'Download the package', href: runDownloadPath(runId, 'handoff') },
    ],
  };
}

function packagePart(c: Context): Part {
  const { handoff } = c.facts;
  if (handoff === null) return lockedPackage(c);
  const href = `/runs/${handoff.runId}`;
  if (handoff.gaps && !handoff.outOfDate) return gapsPart(handoff.runId);
  if (handoff.outOfDate) {
    return {
      state: 'out-of-date',
      detail: 'Out of date: the brief or the source run changed',
      href,
    };
  }
  const earlier = c.plan !== null && phaseOf(c.plan) !== 'completed';
  return { state: 'done', detail: earlier ? 'An earlier package is kept' : 'Ready to open', href };
}

function costsOf(c: Context): Readonly<Record<string, string>> {
  const { source, plan } = c;
  return {
    scan: 'No model cost',
    understand: source === null ? NO_COST : costLabel(source.costMicros),
    plan: plan === null ? 'No cost yet' : costLabel(plan.costMicros),
    package: 'Included in the plan',
  };
}

const parts: readonly (readonly [StepKey, string, (c: Context) => Part])[] = [
  ['scan', 'Scan', scanPart],
  ['understand', 'Understand', understandPart],
  ['questions', 'Questions', questionsPart],
  ['brief', 'Brief', briefPart],
  ['estimate', 'Estimate', estimatePart],
  ['plan', 'Plan', planPart],
  ['package', 'Package', packagePart],
];

/** A step that is open and holds the next action is the current one. */
const stateOf = (part: Part, here: boolean): StepState =>
  here && part.state === 'upcoming' ? 'current' : part.state;

// RF-615
export function journeyOf(
  facts: JourneyFacts,
  projectId: string,
  /** RF-646: the user chose not to Deepen the source run. */
  skippedDeepen = false,
): JourneyView {
  const { source, plan } = facts;
  const setUp = source === null ? undefined : `/projects/${projectId}/plan-setup?run=${source.id}`;
  const context: Context = { facts, projectId, source, plan, setUp, skippedDeepen };
  const next = nextOf(context);
  const costs = costsOf(context);
  const steps = parts.map(([key, title, partOf]): JourneyStep => {
    const part = partOf(context);
    const here = key === next.here;
    return {
      ...{ key, title, detail: part.detail, href: part.href, here },
      ...{ state: stateOf(part, here), cost: costs[key] ?? NO_COST },
      links: part.links ?? [],
    };
  });
  const spent = (source?.costMicros ?? 0) + (plan?.costMicros ?? 0);
  return { steps, action: next.action, secondary: next.secondary, totalCostMicros: spent };
}
