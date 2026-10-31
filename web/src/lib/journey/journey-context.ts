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
}

export type RunPhase = 'working' | 'completed' | 'stopped';

type RunState = Pick<JourneyRunFacts, 'queueState' | 'endState'>;

export function phaseOf(run: RunState): RunPhase {
  if (run.queueState !== 'Ended') return 'working';
  return run.endState === 'Completed' ? 'completed' : 'stopped';
}

export const workingText = (run: Pick<JourneyRunFacts, 'queueState'>): string =>
  run.queueState === 'Queued' ? 'Waiting in the queue' : 'Running now';

/** How a run that stopped ended, with the code it ended with. */
export function endText(
  run: Pick<JourneyRunFacts, 'endState' | 'errorCode' | 'unreadAreas'>,
): string {
  const code = run.errorCode === null ? '' : ` (${run.errorCode})`;
  // P7-02: a capped run that left areas unread reads "Partly read".
  if (run.endState === 'CapReached' && (run.unreadAreas ?? 0) > 0) return `Partly read${code}`;
  if (run.endState === 'CapReached') return `Stopped at its cap${code}`;
  return run.endState === 'Failed' ? `Failed${code}` : `Interrupted${code}`;
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
 * the user chose not to Deepen, the questions are asked.
 */
export function deepenFirst(c: Pick<Context, 'source' | 'skippedDeepen'>): boolean {
  const { source } = c;
  if (source === null || c.skippedDeepen) return false;
  return phaseOf(source) === 'completed' && !source.isDeepen && source.deepens === 0;
}
