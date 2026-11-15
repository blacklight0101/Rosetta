import { queueSuffix } from '../live-run/queue-text.js';
import type {
  JourneyFacts,
  JourneyRunFacts,
  JourneySourceFacts,
} from '../../api/journey-schemas.js';

// RF-615, RST-1802: what every step of the journey reads: the facts, the two runs and the page of
// Plan setup, and the questions the facts answer (is a run working, did it complete, did it stop,
// why can the plan not be taken; a run that stopped at a cap with Supported claims can, P3-121).

export type StepKey =
  'scan' | 'understand' | 'questions' | 'brief' | 'estimate' | 'plan' | 'package';

export interface Context {
  readonly facts: JourneyFacts;
  readonly projectId: string;
  readonly source: JourneySourceFacts | null;
  readonly plan: JourneyRunFacts | null;
  /** Plan setup for the source run; none while the project has no understand run. */
  readonly setUp: string | undefined;
  /** RF-646: the user chose not to Deepen the source run. */
  readonly skippedDeepen: boolean;
  /** P8-26 (RF-1020): the queued or running run of the project, when the page knows it. */
  readonly liveRunId?: string | undefined;
  /** P8-26 (RF-241): the questions with an answer that wait for a re-run; none when not known. */
  readonly answered?: number | undefined;
  /** RF-1021 (P8-84): the source run read own code below the coverage bar; none when the page does not know. */
  readonly belowBar?: boolean | undefined;
}

/** What a page knows beyond the facts of the server (P8-26). */
export interface JourneyExtras {
  /** The queued or running run of the project; the step that waits for it links to it. */
  readonly liveRunId?: string | undefined;
  /** RF-241: the questions with an answer that wait for a re-run. */
  readonly answered?: number | undefined;
  /**
   * RF-1021 (P8-84): the run page knows the coverage of its run: below the bar Deepen is the next
   * step, at the bar or above it is not, as in Your turn. Pages that do not know leave it out.
   */
  readonly belowBar?: boolean | undefined;
}

export type RunPhase = 'working' | 'completed' | 'stopped';

type RunState = Pick<JourneyRunFacts, 'queueState' | 'endState'>;

export function phaseOf(run: RunState): RunPhase {
  if (run.queueState !== 'Ended') return 'working';
  return run.endState === 'Completed' ? 'completed' : 'stopped';
}

const workingText = (run: Pick<JourneyRunFacts, 'queueState' | 'position'>): string => {
  if (run.queueState === 'AwaitingApproval')
    return 'Paused near the approved amount: it waits for you';
  if (run.queueState !== 'Queued') return 'Running now';
  return `Waiting in the queue${queueSuffix(run.position)}`;
};

/**
 * How a run that stopped ended, with the code it ended with. A run at its cap is named by the step
 * word "Stopped at its cap" (P8-112), so its detail keeps only the code, or "Partly read" (P7-02).
 */
export function endText(
  run: Pick<JourneyRunFacts, 'endState' | 'errorCode' | 'unreadAreas'>,
): string {
  const code = run.errorCode === null ? '' : ` (${run.errorCode})`;
  // P7-02: a capped run that left areas unread reads "Partly read".
  if (run.endState === 'CapReached' && (run.unreadAreas ?? 0) > 0) return `Partly read${code}`;
  if (run.endState === 'CapReached') return run.errorCode ?? '';
  return `Failed${code}`;
}

/** P8-111: a run no restart and no queue cancel ended is "stopped" (by you), as before. */
function interruptedState(
  reason: JourneyRunFacts['endReason'],
): 'stopped' | 'restarted' | 'cancelled' {
  if (reason === 'Restart') return 'restarted';
  return reason === 'QueueCancel' ? 'cancelled' : 'stopped';
}

/**
 * The state and detail of a run that has not completed: working, waiting for approval, stopped by
 * the user (P8-87: "Stopped by you" is the state word, the detail keeps only its code; P8-111: a
 * restart or a cancel while queued has its own word), at its cap
 * (P8-112, DEC-217: "Stopped at its cap", never "Failed") or failed.
 */
export function unfinishedStep(
  run: Pick<
    JourneyRunFacts,
    'queueState' | 'position' | 'endState' | 'endReason' | 'errorCode' | 'unreadAreas'
  >,
): {
  readonly state:
    | 'awaiting'
    | 'upcoming'
    | 'stopped'
    | 'restarted'
    | 'cancelled'
    | 'capped'
    | 'stopped-here'
    | 'failed';
  readonly detail: string;
} {
  if (phaseOf(run) === 'working') {
    const state = run.queueState === 'AwaitingApproval' ? 'awaiting' : 'upcoming';
    return { state, detail: workingText(run) };
  }
  if (run.endState === 'Interrupted') {
    return { state: interruptedState(run.endReason), detail: run.errorCode ?? '' };
  }
  if (run.endState === 'CapReached' && run.endReason === 'StoppedAtApproval') {
    // P9-14: no code, but the areas the stop left unread are still told.
    return { state: 'stopped-here', detail: (run.unreadAreas ?? 0) > 0 ? 'Partly read' : '' };
  }
  if (run.endState === 'CapReached') return { state: 'capped', detail: endText(run) };
  return { state: 'failed', detail: endText(run) };
}

/**
 * Why the brief, the estimate and the plan cannot be taken from this understand run, or undefined
 * when they can (RF-615, DEC-143 Q-B): the run is missing, still working, stopped (it is resumed
 * first) or holds no Supported claim (RST-1802).
 */
export function lockReason(source: JourneySourceFacts | null): string | undefined {
  if (source === null) return 'Needs an understand run';
  const phase = phaseOf(source);
  if (phase === 'working') return 'Needs the finished run';
  if (phase === 'stopped' && !plannableAtCap(source)) {
    return 'Needs a completed run: resume it first';
  }
  return source.supportedClaims === 0 ? 'Nothing to plan from (RST-1802)' : undefined;
}

/** P3-121: a run that stopped at a cap with Supported claims can be planned from (RF-604). */
export function plannableAtCap(
  run: Pick<JourneySourceFacts, 'endState' | 'supportedClaims'>,
): boolean {
  return run.endState === 'CapReached' && run.supportedClaims > 0;
}

/**
 * RF-646, DEC-179: a run that can be deepened and has not been is not the time to ask: Deepen is
 * recommended first, because it uses the answers given now. Once the last Deepen has ended, or when
 * the user chose not to Deepen, the questions are asked. RF-1021 (P8-84): a page that knows the run
 * read its own code at the bar or above does not recommend Deepen first.
 */
export function deepenFirst(c: Pick<Context, 'source' | 'skippedDeepen' | 'belowBar'>): boolean {
  const { source } = c;
  if (source === null || c.skippedDeepen || c.belowBar === false) return false;
  return (
    phaseOf(source) === 'completed' && !source.isDeepen && source.deepens === 0 && !source.deepening
  );
}

/** P6-19, RF-646: a Deepen is queued or running, so the questions wait for it unless the user skipped it. */
export function deepenRunning(c: Pick<Context, 'source' | 'skippedDeepen'>): boolean {
  const { source } = c;
  if (source === null || c.skippedDeepen) return false;
  return phaseOf(source) === 'completed' && !source.isDeepen && source.deepening;
}
