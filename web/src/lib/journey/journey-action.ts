import type { JourneySourceFacts } from '../../api/journey-schemas.js';
import {
  deepenFirst,
  deepenRunning,
  phaseOf,
  plannableAtCap,
  type Context,
  type StepKey,
} from './journey-context.js';

// RF-615, RF-614, RF-006, DEC-143 Q-F: the one next action of the journey and the step that holds it.
// In order: start a run; wait while a run works; Resume a run that stopped (the plan steps stay
// locked, unless it stopped at a cap with Supported claims: then the plan is offered beside Resume); a new run when nothing can be planned; answer the open questions; set up the plan;
// review the estimate; wait while the plan works; Try the plan again after a failed plan (a failed
// plan is not resumed: it starts a new run after a new estimate); a new estimate when the package is
// out of date; open the package.

export type JourneyAction =
  | { readonly kind: 'link'; readonly label: string; readonly href: string }
  /** Opens the questions; the page that can show them does so, any other page opens the run. */
  | { readonly kind: 'answer'; readonly label: string; readonly href: string }
  /** RF-646: opens the Deepen of the run; the run page focuses it, any other page opens the run. */
  | { readonly kind: 'deepen'; readonly label: string; readonly href: string }
  | { readonly kind: 'resume'; readonly label: string; readonly runId: string };

/** An action that only opens a page. */
export type JourneyLink = Extract<JourneyAction, { readonly kind: 'link' }>;

export interface Next {
  readonly action: JourneyAction | undefined;
  /** DEC-154: "Go on with the defaults" next to "Answer N questions"; it opens the brief. */
  readonly secondary?: JourneyLink;
  readonly here: StepKey;
}

const link = (label: string, href: string): JourneyLink => ({ kind: 'link', label, href });

/** RF-432: a run that waits for approval is continued from its own page, which holds the approval. */
function approvalOf(run: {
  readonly id: string;
  readonly queueState: string;
}): JourneyAction | undefined {
  return run.queueState === 'AwaitingApproval'
    ? link('Review and continue', `/runs/${run.id}`)
    : undefined;
}

function afterTheRun(c: Context, setUp: string): Next | undefined {
  const { source } = c;
  if (source === null) return undefined;
  const phase = phaseOf(source);
  if (phase === 'working') return { action: approvalOf(source), here: 'understand' };
  if (phase === 'stopped') {
    const resume = { kind: 'resume', label: 'Resume this run', runId: source.id } as const;
    // P3-121: a run that stopped at a cap with Supported claims can be planned from; Resume stays
    // the action until the brief is saved, and the plan is offered beside it.
    if (plannableAtCap(source)) {
      if (c.facts.briefSaved) return undefined;
      return {
        action: resume,
        secondary: link('Plan from what was judged', setUp),
        here: 'understand',
      };
    }
    return { action: resume, here: 'understand' };
  }
  if (source.supportedClaims === 0) {
    return {
      action: link('Start a new run', `/projects/${c.projectId}`),
      here: 'understand',
    };
  }
  // RF-615 (Q-44): a saved brief moves the journey on; the questions stay answerable on the run page.
  if (source.openQuestions === 0 || c.facts.briefSaved) return undefined;
  return questionsNext(c, source, setUp);
}

/** RF-646, DEC-179: Deepen first; the questions come after the last Deepen, or at once when the user skips it. */
function questionsNext(c: Context, source: JourneySourceFacts, setUp: string): Next {
  // P6-19: a Deepen is running; there is nothing to start, the questions come after it.
  if (deepenRunning(c)) return { action: undefined, here: 'questions' };
  if (deepenFirst(c)) {
    return {
      action: { kind: 'deepen', label: 'Deepen this run first', href: `/runs/${source.id}` },
      here: 'questions',
    };
  }
  const count = source.openQuestions;
  const label = `Answer ${String(count)} question${count === 1 ? '' : 's'}`;
  return {
    action: { kind: 'answer', label, href: `/runs/${source.id}` },
    secondary: link('Go on with the defaults', setUp),
    here: 'questions',
  };
}

function afterThePlan(c: Context, setUp: string): Next {
  const { plan, facts } = c;
  if (plan === null) return { action: link('Start the plan', setUp), here: 'estimate' };
  const phase = phaseOf(plan);
  if (phase === 'working') return { action: approvalOf(plan), here: 'plan' };
  if (phase === 'stopped') return { action: link('Try the plan again', setUp), here: 'plan' };
  if (facts.handoff?.outOfDate === true) {
    return { action: link('Review the new estimate', setUp), here: 'estimate' };
  }
  const written = facts.handoff;
  if (written === null) return { action: link('Review the estimate', setUp), here: 'estimate' };
  return { action: link('Open the package', `/runs/${written.runId}`), here: 'package' };
}

// RF-615
export function nextOf(c: Context): Next {
  if (c.source === null || c.setUp === undefined) {
    return { action: link('Start a run', `/projects/${c.projectId}`), here: 'scan' };
  }
  const early = afterTheRun(c, c.setUp);
  if (early !== undefined) return early;
  if (!c.facts.briefSaved) return { action: link('Set up the plan', c.setUp), here: 'brief' };
  return afterThePlan(c, c.setUp);
}
