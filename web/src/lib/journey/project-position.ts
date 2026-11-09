import type { JourneyFacts } from '../../api/journey-schemas.js';
import type { LastRun } from '../../api/overview-schemas.js';
import { interruptedWord } from '../interrupted-word.js';
import { headingOf, type HeadingTone } from './project-heading.js';
import { journeyOf } from './journey-steps.js';

// RF-010, RF-615, RF-1021, DEC-222, DEC-226, P8-137, `P8Projects` artboard ("Where it is"): where a
// project stands in the journey. Once the project has an understand run, the words are the status
// the project page gives beside its title, made by `headingOf` from the journey facts the overview
// carries, so a row and the strip of its project cannot say different things ("Questions waiting",
// "Deepen running", "Package out of date"). Until then the page has no status, and the row reads
// the project's newest run: "Scan not started", "Scan running", "Start a run" for a finished scan,
// "Scan failed", or the end-reason wording of a scan that was interrupted.

/** How the position is drawn: a glyph and a colour, always beside the words. */
export type PositionTone = 'idle' | 'working' | 'done' | 'attention' | 'stopped' | 'failed';

export interface ProjectPosition {
  readonly text: string;
  readonly tone: PositionTone;
}

export interface PositionInput {
  readonly projectId: string;
  readonly lastRun: LastRun | null;
  readonly journey: JourneyFacts | null;
  /** RF-646: the viewer chose not to Deepen the journey's source run, as the project page knows. */
  readonly skippedDeepen: boolean;
}

const NOT_STARTED: ProjectPosition = { text: 'Scan not started', tone: 'idle' };

/** The tone of the project page's status as the glyph of the row. */
const tones: Readonly<Record<HeadingTone, PositionTone>> = {
  ok: 'done',
  info: 'working',
  warn: 'attention',
  danger: 'failed',
};

const stepOf = (stage: string): string => `${stage.slice(0, 1).toUpperCase()}${stage.slice(1)}`;

function completedPosition(stage: string): ProjectPosition {
  if (stage === 'scan') return { text: 'Start a run', tone: 'idle' };
  return { text: stage === 'plan' ? 'Package ready' : `${stepOf(stage)} done`, tone: 'done' };
}

function endedPosition(run: LastRun): ProjectPosition {
  const step = stepOf(run.stage);
  if (run.endState === 'Completed') return completedPosition(run.stage);
  if (run.endState === 'CapReached') {
    return { text: `${step} stopped at its cap`, tone: 'attention' };
  }
  if (run.endState === 'Interrupted') {
    return { text: interruptedWord(run.endReason), tone: 'stopped' };
  }
  return { text: `${step} failed`, tone: 'failed' };
}

/** Before the first understand run: the newest run, or the first step when there is none. */
function lastRunPosition(lastRun: LastRun | null): ProjectPosition {
  if (lastRun === null) return NOT_STARTED;
  if (lastRun.queueState === 'Queued') {
    return { text: `${stepOf(lastRun.stage)} queued`, tone: 'working' };
  }
  if (lastRun.queueState === 'Running') {
    return { text: `${stepOf(lastRun.stage)} running`, tone: 'working' };
  }
  if (lastRun.queueState === 'AwaitingApproval') {
    return { text: 'Paused for approval', tone: 'attention' };
  }
  return endedPosition(lastRun);
}

// RF-010
export function positionOf(input: PositionInput): ProjectPosition {
  const { journey, projectId } = input;
  const view =
    journey === null ? undefined : journeyOf(journey, projectId, input.skippedDeepen, {});
  // The name is the title of the page, which the row does not show.
  const status = headingOf('', view).status;
  if (status === undefined) return lastRunPosition(input.lastRun);
  return { text: status.text, tone: tones[status.tone] };
}
