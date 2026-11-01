import type { JSX } from 'preact';
import type { RunRow } from '../api/run-schemas.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import { JourneyPanel } from './JourneyPanel.js';

// RF-615, RF-1015: where the journey strip sits on the page of a run. An understand run that has
// ended shows it in "after the run" mode, before the tabs, and Answer questions in it opens the
// Your questions tab; a plan run shows it in both modes, from the moment it is queued. Any other run,
// and an understand run that is still working (it has its own run journey, RF-1015), shows none. The
// strip reads the facts again when the run ends or the number of open questions changes.

export interface RunJourneyProps {
  readonly run: RunRow;
  readonly stage: string;
  readonly phase: RunPhase;
  readonly onResumed: () => void;
}

const phaseKey = (phase: RunPhase): string =>
  phase.kind === 'ended' ? phase.endState : phase.kind;

/** RF-646: the journey's "Deepen this run first" takes the user to the Deepen of the Your turn panel. */
function focusDeepen(): void {
  const button = document.getElementById('deepen-this-run');
  if (button === null) return;
  if (typeof button.scrollIntoView === 'function') button.scrollIntoView({ block: 'center' });
  button.focus();
}

// RF-615
export function UnderstandJourney(
  props: RunJourneyProps & {
    readonly open?: number | undefined;
    readonly onAnswer?: (() => void) | undefined;
  },
): JSX.Element | null {
  const { run, stage, phase, open } = props;
  if (stage !== 'understand') return null;
  return (
    <JourneyPanel
      {...{ projectId: run.projectId, runId: run.id, onResumed: props.onResumed }}
      refresh={`${phaseKey(phase)}:${String(open ?? '')}`}
      onAnswer={props.onAnswer}
      onDeepen={focusDeepen}
    />
  );
}

// RF-615
export function PlanJourney(props: RunJourneyProps): JSX.Element | null {
  const { run, stage, phase } = props;
  if (stage !== 'plan') return null;
  return (
    <JourneyPanel
      {...{ projectId: run.projectId, runId: run.id, onResumed: props.onResumed }}
      refresh={phaseKey(phase)}
    />
  );
}

// RF-1020
export function ScanJourney(props: RunJourneyProps): JSX.Element | null {
  const { run, stage, phase } = props;
  if (stage !== 'scan') return null;
  return (
    <JourneyPanel
      {...{ projectId: run.projectId, runId: undefined, onResumed: props.onResumed }}
      refresh={phaseKey(phase)}
    />
  );
}

/** RF-1020: the strip on a run page: scan and plan runs, and an understand run that is still working. */
export function RunJourneys(props: RunJourneyProps): JSX.Element {
  return (
    <>
      <PlanJourney {...props} />
      <ScanJourney {...props} />
      {props.phase.kind === 'ended' ? null : <UnderstandJourney {...props} />}
    </>
  );
}
