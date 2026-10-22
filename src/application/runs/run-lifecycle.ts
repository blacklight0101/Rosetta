import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run } from '../../domain/runs/run.js';
import {
  endManifest,
  markManifestStarted,
  recordManifestSource,
  type RunManifest,
} from '../../domain/runs/run-manifest.js';
import type { RunEndState } from '../../domain/runs/run-states.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { RunEventHistory, RunEventSink } from '../ports/run-events.js';
import type { ResolvedSource } from '../ports/run-executor.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { RunEventPublisher } from './run-event-publisher.js';
import { scopeOf } from './run-scope.js';
import { startCapsDataOf, type StartCaps } from './run-start-caps.js';
import type { RunStartCaps } from '../../domain/budget/budget.js';
import type { ManifestCaps } from '../../domain/runs/run-manifest.js';

/** The manifest's caps with the run cap the run starts with, so the page meter shows that cap (RF-1106). */
function effectiveCapsOf(caps: ManifestCaps, effective: RunStartCaps): ManifestCaps {
  return { ...caps, run: { ...caps.run, maxCostMicros: Number(effective.run.maxCostMicros) } };
}

// RF-003, RF-126, RF-1006, RNF-002: the steps of a run that touch more than the index. At its start
// the manifest gets the start time and `run.started` opens the event log; when it ends the index
// records the end state (once), then the manifest its end state and time, then `run.ended` closes
// the log. A failure after the index recorded the end is logged and does not undo it: the run is
// over, and the next steps are repaired on the next look at the run folder.

export interface RunLifecycleDependencies {
  readonly runs: RunIndex;
  readonly manifests: RunManifestStore;
  readonly sink: RunEventSink;
  readonly history: RunEventHistory;
  readonly clock: Clock;
  readonly logger: Logger;
  /**
   * The caps a run starts with (RF-1106, DEC-107), recorded on `run.started`; a run without it
   * records the caps of its manifest only (a test without a project).
   */
  readonly startCaps?: Pick<StartCaps, 'of'>;
}

export interface StartedRun {
  readonly run: Run;
  readonly manifest: RunManifest;
  readonly events: RunEventPublisher;
}

export class RunLifecycle {
  private readonly deps: RunLifecycleDependencies;

  constructor(deps: RunLifecycleDependencies) {
    this.deps = deps;
  }

  /** `Queued` -> `Running`, the manifest start and `run.started`; undefined if it was not queued. */
  // RF-003, RF-1006
  async begin(run: Run): Promise<StartedRun | undefined> {
    const { runs, manifests, clock } = this.deps;
    const now = clock.now();
    const started = await runs.start(run.id, now.getTime());
    if (started === undefined) return undefined;
    const scope = scopeOf(started);
    const stored = await manifests.read(scope);
    if (stored === undefined) {
      throw new RosettaError(ERROR_CODES.runManifestFailed, 'The run has no manifest.');
    }
    const manifest = markManifestStarted(stored, now.toISOString());
    await manifests.write(scope, manifest);
    const effective = await this.deps.startCaps?.of(started, manifest);
    const events = await RunEventPublisher.open({ scope, ...this.eventParts() });
    await events.emit('run.started', {
      stage: started.stage,
      source: manifest.source,
      roles: manifest.roles,
      caps: effective === undefined ? manifest.caps : effectiveCapsOf(manifest.caps, effective),
      ...(effective === undefined ? {} : { effectiveCaps: startCapsDataOf(effective) }),
    });
    return { run: started, manifest, events };
  }

  /** Records the pinned commit and the snapshot on the run row and in the manifest. */
  // RF-126
  async recordSource(run: Run, source: ResolvedSource): Promise<void> {
    const { runs, manifests } = this.deps;
    await runs.recordSource(run.id, source);
    const scope = scopeOf(run);
    const stored = await manifests.read(scope);
    if (stored === undefined) return;
    const recorded = recordManifestSource(stored, source);
    if (recorded.ok) await manifests.write(scope, recorded.value);
  }

  /** Ends the run once; undefined when it had already ended. */
  // RF-003, RNF-002
  async finish(run: Run, endState: RunEndState, detail: EndDetail = {}): Promise<Run | undefined> {
    const now = this.deps.clock.now();
    const ended = await this.deps.runs.end(
      run.id,
      endState,
      now.getTime(),
      detail.failedAreas ?? 0,
    );
    if (ended === undefined) return undefined;
    const manifest = await this.attempt(ended, 'the manifest', () =>
      this.endManifestOf(ended, endState, now.toISOString()),
    );
    await this.attempt(ended, 'run.ended', async () => {
      const events = await RunEventPublisher.open({ scope: scopeOf(ended), ...this.eventParts() });
      await events.emit('run.ended', endData(ended, endState, manifest, detail));
    });
    return ended;
  }

  private eventParts(): Pick<RunLifecycleDependencies, 'sink' | 'history' | 'clock'> {
    const { sink, history, clock } = this.deps;
    return { sink, history, clock };
  }

  private async endManifestOf(
    run: Run,
    endState: RunEndState,
    endedAt: string,
  ): Promise<RunManifest | undefined> {
    const scope = scopeOf(run);
    const stored = await this.deps.manifests.read(scope);
    if (stored === undefined) return undefined;
    const ended = endManifest(stored, endState, endedAt);
    if (!ended.ok) return stored;
    await this.deps.manifests.write(scope, ended.value);
    return ended.value;
  }

  private async attempt<T>(run: Run, what: string, step: () => Promise<T>): Promise<T | undefined> {
    try {
      return await step();
    } catch (error) {
      await this.deps.logger.log({
        level: 'error',
        logger: 'runs',
        message: `Could not record ${what} of the ended run ${run.runKey}.`,
        runId: run.runKey,
        userId: run.userId,
        ...(error instanceof RosettaError ? { code: error.code } : {}),
      });
      return undefined;
    }
  }
}

/** What `run.ended` says besides the end state: the error code, and (RF-208) the failed areas. */
export interface EndDetail {
  readonly errorCode?: ErrorCode;
  readonly failedAreas?: number;
}

function endData(
  run: Run,
  endState: RunEndState,
  manifest: RunManifest | undefined,
  detail: EndDetail,
): Record<string, unknown> {
  const { errorCode, failedAreas } = detail;
  return {
    endState,
    totals: { ...manifest?.totals, ...run.totals, calls: manifest?.totals.calls ?? 0 },
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(failedAreas === undefined ? {} : { failedAreas }),
  };
}
