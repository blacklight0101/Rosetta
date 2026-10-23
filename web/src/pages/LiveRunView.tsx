import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { RunRow } from '../api/run-schemas.js';
import { cancelRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { usePublishRunMeter, type RunMeterReading } from '../app/run-meter-signal.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { isLocalEstimate } from '../lib/estimate-math.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import { runMeterReadingOf } from '../lib/live-run/run-meter-reading.js';
import type { RunState, SourceState } from '../lib/live-run/run-state.js';
import { roleTotalsOf } from '../lib/live-run/run-summary.js';
import { EndedBody } from './EndedBody.js';
import { PlanJourney } from './JourneyPlacement.js';
import { PauseUpdates } from './PauseUpdates.js';
import { ResumeControl } from './ResumeControl.js';
import { RunStatusBar } from './RunStatusBar.js';
import { RunningBody } from './RunningBody.js';
import { usePauseUpdates } from './use-pause-updates.js';
import { useRunEstimate } from './use-run-estimate.js';
import type { RunStream } from './use-run-stream.js';

// RF-1002, RF-1003, RF-424, RF-1004, RF-1005, design-system.md section 14 (live run): the page of a
// run that exists: the head with Stop, then the page of the run while it runs (`RunningBody`) or
// after it (`EndedBody`); it switches by itself when the run ends. Everything shown comes from the
// run row and the run's events.

export interface LiveRunViewProps {
  readonly run: RunRow;
  readonly stream: RunStream;
  readonly phase: RunPhase;
  /** RF-006: called once the server has queued the run again, so the page can follow it anew. */
  readonly onResumed: () => void;
}

/** The commit the source was pinned to is known from the events or, late, from the run row; an upload has the run. */
function sourceOf(state: RunState, run: RunRow): SourceState | undefined {
  const { source } = state;
  if (source === undefined) return undefined;
  if (source.kind === 'upload') return { ...source, runId: run.id, reportBuilt: run.reportBuilt };
  return { ...source, commitSha: source.commitSha ?? run.commitSha ?? undefined };
}

/** The cost so far: what the run row has, or the end of the run, or the roles' own, the largest. */
function costOf(state: RunState, run: RunRow): number {
  const roles = Object.values(state.roleCostMicros).reduce((sum, each) => sum + each, 0);
  return Math.max(run.totals.costMicros, state.ended?.costMicros ?? 0, roles);
}

/** The tokens of every role so far. */
function tokensOf(state: RunState): number {
  return roleTotalsOf(state).reduce((sum, role) => sum + role.inputTokens + role.outputTokens, 0);
}

/**
 * The run's spend against its cap for the top bar, only while the run works and its cap is known:
 * tokens against the token cap when every model is local (P5-07), else the cost against its cap.
 */
// RF-1003
function meterOf(
  state: RunState,
  run: RunRow,
  phase: RunPhase,
  local: boolean,
): RunMeterReading | undefined {
  if (phase.kind !== 'running') return undefined;
  return runMeterReadingOf({
    caps: state.caps,
    costMicros: costOf(state, run),
    tokens: tokensOf(state),
    local,
  });
}

function useStop(runId: string): {
  readonly busy: boolean;
  readonly stopping: boolean;
  readonly error: ApiFailure | undefined;
  readonly stop: () => void;
} {
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>();
  const stop = (): void => {
    setBusy(true);
    setError(undefined);
    // The route takes the run's UUID; the folder name is not an id.
    void cancelRun(client, runId).then((result) => {
      setBusy(false);
      if (result.ok) setStopping(true);
      else setError(result.error);
    });
  };
  return { busy, stopping, error, stop };
}

function Connection({ stream }: { readonly stream: RunStream }): JSX.Element | null {
  if (stream.failure !== undefined) return <ErrorBanner error={stream.failure} />;
  if (stream.connection !== 'reconnecting') return null;
  return (
    <p class="rst-callout rst-callout--warn" role="status" data-testid="connection">
      Reconnecting to the live stream. The page catches up with what it missed.
    </p>
  );
}

// RF-1002, RF-1015
export function LiveRunView({ run, stream, phase, onResumed }: LiveRunViewProps): JSX.Element {
  const { state } = stream;
  const view = usePauseUpdates(state);
  const stop = useStop(run.id);
  const planned = state.agents.some((agent) => agent.state !== 'Planned');
  const stage = state.stage ?? run.stage;
  const estimate = useRunEstimate(
    run.projectId,
    stage,
    planned ? state.agents.map((agent) => agent.area) : [],
  );
  usePublishRunMeter(
    meterOf(state, run, phase, estimate !== undefined && isLocalEstimate(estimate)),
  );
  return (
    <div class="rst-live">
      <RunStatusBar
        {...{ phase, stage, projectId: run.projectId, runKey: run.runId }}
        failedAreas={state.ended?.failedAreas ?? run.failedAreas}
        {...{ stopping: stop.stopping, busy: stop.busy, stopError: stop.error, onStop: stop.stop }}
        updatesNote={view.note}
        resume={<ResumeControl {...{ phase, onResumed, runId: run.id, stage }} />}
        controls={
          view.paused || phase.kind === 'running' ? (
            <PauseUpdates paused={view.paused} waiting={view.waiting} onToggle={view.toggle} />
          ) : null
        }
      />
      <Connection stream={stream} />
      <PlanJourney {...{ run, stage, phase, onResumed }} />
      {phase.kind === 'ended' ? (
        <EndedBody
          {...{ run, state, phase, stage, estimate, onResumed }}
          shown={view.shown}
          costMicros={costOf(state, run)}
          source={sourceOf(state, run)}
        />
      ) : (
        <RunningBody
          {...{ run, phase, stage, estimate }}
          state={view.shown}
          costMicros={costOf(state, run)}
          source={sourceOf(state, run)}
        />
      )}
    </div>
  );
}
