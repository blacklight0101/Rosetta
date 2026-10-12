import type { ErrorCode } from '../../domain/errors/codes.js';
import type { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { RunEndState } from '../../domain/runs/run-states.js';
import type { RunEventPublisher } from '../runs/run-event-publisher.js';

// RF-1108, RF-003: what the run queue starts. Each stage's use case (the scan run of P1-23, then
// understand, report and plan) is a RunExecutor registered for its stage. The queue has already
// marked the run `Running`, written the start into the manifest and published `run.started`; when
// `execute` returns, the queue records the end state, the manifest end and `run.ended`.

export interface RunExecution {
  readonly run: Run;
  /** The manifest as written when the run started; the executor records what it learns. */
  readonly manifest: RunManifest;
  readonly events: RunEventPublisher;
  /**
   * Aborted when the user stops the run, the server shuts down (RF-1108, RNF-002) or a cap refuses
   * a call (RF-422; the reason is the refusal).
   */
  readonly signal: AbortSignal;
  /**
   * Aborts `signal` with the reason, stopping every task of the run; the budget guard calls it with
   * its refusal (RST-1600), after which the run ends `CapReached` whatever the executor returns.
   */
  stop(reason: RosettaError): void;
  /** Records the pinned commit, the snapshot folder and its hash once the source is resolved (RF-126). */
  recordSource(source: ResolvedSource): Promise<void>;
}

export interface ResolvedSource {
  readonly commitSha: string;
  /** The snapshot folder name. */
  readonly snapshotKey: string;
  /** `sha256:` of the snapshot tree. */
  readonly snapshotHash: string;
}

export interface RunOutcome {
  readonly endState: RunEndState;
  /** The error code of a `Failed` run; shown with `run.ended`. */
  readonly errorCode?: ErrorCode;
}

export interface RunExecutor {
  /** Runs the stage to its end. A thrown error ends the run as `Failed`. */
  execute(execution: RunExecution): Promise<RunOutcome>;
}
