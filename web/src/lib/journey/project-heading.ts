import type { EndReason } from '../../api/end-reason.js';
import { interruptedPhrase } from '../interrupted-word.js';
import type { JourneyStep, JourneyView, StepState } from './journey-steps.js';

// RF-1021, RF-1020, DEC-211 (P8-26): the title of the project page. Before the first run it is
// "Start a run"; once the project has a run it is the project's name, with the current step of the
// journey beside it ("Package ready", "Questions waiting"). A live run is said in the status, which
// links to the run. Derived from the journey view; nothing is stored.

export type HeadingTone = 'ok' | 'warn' | 'info' | 'danger';

interface HeadingStatus {
  readonly text: string;
  readonly tone: HeadingTone;
  /** The run page of a live run; the status is then a link. */
  readonly href: string | undefined;
}

export interface ProjectHeading {
  readonly title: string;
  readonly status: HeadingStatus | undefined;
}

const plain = (text: string, tone: HeadingTone, href?: string): HeadingStatus => ({
  text,
  tone,
  href,
});

/** The step that holds the next action. */
const hereOf = (view: JourneyView): JourneyStep | undefined => view.steps.find((step) => step.here);

function packageStatus(step: JourneyStep): HeadingStatus {
  if (step.state === 'gaps') return plain('Package with gaps', 'warn');
  if (step.state === 'out-of-date') return plain('Package out of date', 'warn');
  return plain('Package ready', 'ok');
}

const interruptions: Partial<Record<StepState, EndReason>> = {
  stopped: 'UserStop',
  restarted: 'Restart',
  cancelled: 'QueueCancel',
};

/** P8-111: "stopped by you", "stopped by a restart" or "cancelled while queued"; none for any other step. */
function interruptedHeading(step: JourneyStep): string | undefined {
  const reason = interruptions[step.state];
  return reason === undefined ? undefined : interruptedPhrase(reason);
}

function understandStatus(step: JourneyStep, view: JourneyView): HeadingStatus {
  if (step.state === 'failed') return plain('Understand stopped', 'danger', step.href);
  const interrupted = interruptedHeading(step);
  if (interrupted !== undefined) return plain(`Understand ${interrupted}`, 'warn', step.href);
  if (step.state === 'capped') return plain('Understand stopped at its cap', 'warn', step.href);
  if (step.state === 'stopped-here') {
    return plain(`Understand ${interruptedPhrase('StoppedAtApproval')}`, 'warn', step.href);
  }
  if (step.state === 'awaiting') return plain('Paused for approval', 'warn', step.href);
  if (step.state === 'upcoming' || step.state === 'current') {
    return plain('Understand running', 'info', step.href);
  }
  return plain(
    view.facts.source?.supportedClaims === 0 ? 'Nothing to plan from' : 'Understand done',
    'warn',
  );
}

function questionsStatus(view: JourneyView, step: JourneyStep): HeadingStatus {
  const { action } = view;
  if (action?.kind === 'deepen') return plain('Deepen waiting', 'info');
  if (action === undefined) return plain('Deepen running', 'info', step.href);
  return plain('Questions waiting', 'warn');
}

function planStatus(step: JourneyStep): HeadingStatus {
  if (step.state === 'failed') return plain('Plan failed', 'danger', step.href);
  const interrupted = interruptedHeading(step);
  if (interrupted !== undefined) return plain(`Plan ${interrupted}`, 'warn', step.href);
  if (step.state === 'capped') return plain('Plan stopped at its cap', 'warn', step.href);
  if (step.state === 'stopped-here') {
    return plain(`Plan ${interruptedPhrase('StoppedAtApproval')}`, 'warn', step.href);
  }
  if (step.state === 'awaiting') return plain('Paused for approval', 'warn', step.href);
  return plain('Plan running', 'info', step.href);
}

function statusOf(view: JourneyView, step: JourneyStep): HeadingStatus {
  // A package that no longer matches the brief asks for a new estimate: the title says the package is stale.
  if (view.facts.handoff?.outOfDate === true && step.key === 'estimate') {
    return plain('Package out of date', 'warn');
  }
  if (step.key === 'package') return packageStatus(step);
  if (step.key === 'understand') return understandStatus(step, view);
  if (step.key === 'questions') return questionsStatus(view, step);
  if (step.key === 'plan') return planStatus(step);
  if (step.key === 'brief') return plain('Plan setup waiting', 'warn');
  return plain('Estimate waiting', 'warn');
}

// RF-1021
export function headingOf(projectName: string, view: JourneyView | undefined): ProjectHeading {
  const step = view === undefined ? undefined : hereOf(view);
  // No journey read yet, or no run to show: the page starts one.
  if (view === undefined || step === undefined || view.facts.source === null) {
    return { title: 'Start a run', status: undefined };
  }
  return { title: projectName, status: statusOf(view, step) };
}

/** The project has a run, so its page shows the journey rather than the start of one. */
// RF-1021
export function hasRun(view: JourneyView | undefined): boolean {
  return view !== undefined && view.facts.source !== null;
}

/**
 * RF-1021, P8-26: the journey has to start (no run, or a run with nothing to plan from), so the
 * areas, the estimate and Analyse stay open; with a run to go on from they are collapsed.
 */
// RF-1021
export function startsHere(view: JourneyView | undefined): boolean {
  if (view === undefined || !hasRun(view)) return true;
  const { action } = view;
  return action?.kind === 'link' && action.href.split('?')[0] === `/projects/${view.projectId}`;
}
