import type { LastRun } from '../../api/overview-schemas.js';
import { interruptedWord } from '../interrupted-word.js';

// RF-010, RF-615, RF-1008, DEC-222, `P8Projects` artboard ("Where it is"): where a project stands in the
// journey, read from its newest run, which the overview already holds, so the list asks for nothing
// per row. The words are the journey strip's: a step and its state ("Understand running"), "Package ready"
// for a finished plan run, the end-reason wording of a run that was interrupted, and, for a project with
// no run, the first step of the journey.

/** How the position is drawn: a glyph and a colour, always beside the words. */
export type PositionTone = 'idle' | 'working' | 'done' | 'attention' | 'stopped' | 'failed';

export interface ProjectPosition {
  readonly text: string;
  readonly tone: PositionTone;
}

const NOT_STARTED: ProjectPosition = { text: 'Scan not started', tone: 'idle' };

const stepOf = (stage: string): string => `${stage.slice(0, 1).toUpperCase()}${stage.slice(1)}`;

function endedPosition(run: LastRun): ProjectPosition {
  const step = stepOf(run.stage);
  if (run.endState === 'Completed') {
    return { text: run.stage === 'plan' ? 'Package ready' : `${step} done`, tone: 'done' };
  }
  if (run.endState === 'CapReached') {
    return { text: `${step} stopped at its cap`, tone: 'attention' };
  }
  if (run.endState === 'Interrupted') {
    return { text: interruptedWord(run.endReason), tone: 'stopped' };
  }
  return { text: `${step} failed`, tone: 'failed' };
}

// RF-010
export function positionOf(lastRun: LastRun | null): ProjectPosition {
  if (lastRun === null) return NOT_STARTED;
  if (lastRun.queueState === 'Queued') {
    return { text: `${stepOf(lastRun.stage)} queued`, tone: 'working' };
  }
  if (lastRun.queueState === 'Running') {
    return { text: `${stepOf(lastRun.stage)} running`, tone: 'working' };
  }
  return endedPosition(lastRun);
}
