import type { EpochMs } from '../../domain/accounts/user.js';
import type { RunEndState, RunQueueState } from '../../domain/runs/run-states.js';

// RF-615, RF-614, DEC-142, DEC-143: the facts the journey strip is drawn from, derived and never
// stored. They come from the run index, the manifests, the saved brief and the end of each run's
// events; the strip itself (which step is current, locked, failed or out of date) is the page's.

/** One run of the journey: the understand run or the newest plan run written from it. */
export interface JourneyRun {
  readonly id: string;
  /** The run's folder name. */
  readonly runKey: string;
  readonly queueState: RunQueueState;
  readonly endState: RunEndState | null;
  readonly endedAt: EpochMs | null;
  readonly costMicros: number;
  /** The `RST` code the run ended with; null when it ended without one or has not ended. */
  readonly errorCode: string | null;
  /** P7-02: the planned areas no reader started; a capped run with some is "Partly read". */
  readonly unreadAreas?: number;
  /** EV-80: the place of a queued run in the queue, counted from 1; null for any other run. */
  readonly position?: number | null;
}

/** The understand run the package is written from. */
export interface JourneySource extends JourneyRun {
  /** The Supported claims of its cards; 0 until it has ended `Completed`. */
  readonly supportedClaims: number;
  /** The questions of the run that are still open; 0 until it has ended `Completed`. */
  readonly openQuestions: number;
  /** RF-646: how many Deepens linked to the run's first understand run have ended (DEC-179). */
  readonly deepens: number;
  /** RF-646: the run is itself a Deepen. */
  readonly isDeepen: boolean;
  /** P6-33: a Deepen linked to the run's first understand run is queued or running. */
  readonly deepening: boolean;
}

/**
 * The hand-off package: the newest plan run of the project that ended `Completed`, or that ended
 * RST-1806 after writing the package with gaps (RF-627).
 */
export interface JourneyHandoff {
  readonly runId: string;
  readonly runKey: string;
  /** The brief or the source run changed after the package was written (RF-615, DEC-143 Q-C). */
  readonly outOfDate: boolean;
  /** The plan run ended RST-1806: some items are built by no task card (checks.md lists them). */
  readonly gaps: boolean;
}

export interface Journey {
  /** The understand run the journey is about; null while the project has none. */
  readonly source: JourneySource | null;
  /** The project's newest scan run that ended `Completed`, which has a page of its own. */
  readonly scanRunId: string | null;
  /** Whether the project has a saved planning brief. */
  readonly briefSaved: boolean;
  /** The newest plan run written from the source run. */
  readonly plan: JourneyRun | null;
  readonly handoff: JourneyHandoff | null;
}
