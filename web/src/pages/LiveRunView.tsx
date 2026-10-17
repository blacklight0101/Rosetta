import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { RunEstimate } from '../api/estimate-schemas.js';
import type { RunRow } from '../api/run-schemas.js';
import { cancelRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { usePublishRunMeter, type RunMeterReading } from '../app/run-meter-signal.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Link } from '../components/Link.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import type { RunState, SourceState } from '../lib/live-run/run-state.js';
import { stepperOf } from '../lib/live-run/run-stepper.js';
import { AgentsGrid } from './AgentsGrid.js';
import { ClaimsList } from './ClaimsList.js';
import { CoverageMap } from './CoverageMap.js';
import { EventLog } from './EventLog.js';
import { FailedAreas } from './FailedAreas.js';
import { RunAnswers } from './RunAnswers.js';
import { RunDownloads } from './RunDownloads.js';
import { RunFailure } from './RunFailure.js';
import { RunMeter } from './RunMeter.js';
import { RunOverview } from './RunOverview.js';
import { RunReport } from './RunReport.js';
import { PauseUpdates } from './PauseUpdates.js';
import { ResumeControl } from './ResumeControl.js';
import { RunStatusBar } from './RunStatusBar.js';
import { RunningBody } from './RunningBody.js';
import { RunStepper } from './RunStepper.js';
import { usePauseUpdates } from './use-pause-updates.js';
import { useRunEstimate } from './use-run-estimate.js';
import type { RunStream } from './use-run-stream.js';

// RF-1002, RF-1003, RF-424, RF-1004, RF-1005, design-system.md section 14 (live run): the page of a
// run that exists: head with Stop, downloads, the overview, the run meter, one panel per agent, the
// coverage map, the claims and the verbose event log. Everything shown comes from the run row and
// the run's events.

export interface LiveRunViewProps {
  readonly run: RunRow;
  readonly stream: RunStream;
  readonly phase: RunPhase;
  /** RF-006: called once the server has queued the run again, so the page can follow it anew. */
  readonly onResumed: () => void;
}

/** The commit the source was pinned to is known from the events or, late, from the run row. */
function sourceOf(state: RunState, run: RunRow): SourceState | undefined {
  if (state.source === undefined) return undefined;
  return { ...state.source, commitSha: state.source.commitSha ?? run.commitSha ?? undefined };
}

/** The cost so far: what the run row has, or the end of the run, or the roles' own, the largest. */
function costOf(state: RunState, run: RunRow): number {
  const roles = Object.values(state.roleCostMicros).reduce((sum, each) => sum + each, 0);
  return Math.max(run.totals.costMicros, state.ended?.costMicros ?? 0, roles);
}

/** The run's cost against its cap for the top bar, only while the run works and its cap is known. */
// RF-1003
function meterOf(state: RunState, run: RunRow, phase: RunPhase): RunMeterReading | undefined {
  const capMicros = state.caps?.maxCostMicros ?? 0;
  if (phase.kind !== 'running' || !(capMicros > 0)) return undefined;
  return { costMicros: costOf(state, run), capMicros };
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

/**
 * RF-504, P1-130: whether the run has a report. One built earlier comes with the run row; one built
 * from this page turns the Report step done at once, without reading the run again.
 */
function useReportBuilt(run: RunRow): { readonly built: boolean; readonly onBuilt: () => void } {
  const [builtHere, setBuiltHere] = useState(false);
  return {
    built: run.reportBuilt || builtHere,
    onBuilt: () => {
      setBuiltHere(true);
    },
  };
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

interface BodyProps {
  readonly run: RunRow;
  readonly state: RunState;
  readonly shown: RunState;
  readonly phase: RunPhase;
  readonly stage: string;
  readonly estimate: RunEstimate | undefined;
}

/** The run has ended: the page as it was before the running mode, until P1-170 builds the after-run one. */
function EndedBody(props: BodyProps): JSX.Element {
  const { run, state, shown, phase, stage, estimate } = props;
  const report = useReportBuilt(run);
  return (
    <>
      <RunStepper
        steps={stepperOf(
          { stage, commitSha: run.commitSha, reportBuilt: report.built },
          shown,
          phase,
        )}
      />
      {state.ended?.errorCode === undefined ? null : <RunFailure code={state.ended.errorCode} />}
      <FailedAreas state={shown} projectId={run.projectId} />
      <p class="rst-p137-live-link">
        <Link href={`/runs/${encodeURIComponent(run.id)}/calls`}>API calls and logs</Link>
      </p>
      <RunDownloads runId={run.id} stage={stage} ended />
      <RunReport runId={run.id} ended onBuilt={report.onBuilt} />
      <RunOverview state={shown} />
      <RunMeter state={state} costMicros={costOf(state, run)} estimate={estimate} />
      <AgentsGrid state={shown} />
      {stage === 'understand' ? <CoverageMap state={shown} /> : null}
      <ClaimsList claims={shown.claims} source={sourceOf(state, run)} />
      {stage === 'understand' ? <RunAnswers runId={run.id} ended /> : null}
      <EventLog lines={shown.log} startedAt={shown.startedAt} />
    </>
  );
}

// RF-1002, RF-1015
export function LiveRunView({ run, stream, phase, onResumed }: LiveRunViewProps): JSX.Element {
  const { state } = stream;
  const view = usePauseUpdates(state);
  const stop = useStop(run.id);
  usePublishRunMeter(meterOf(state, run, phase));
  const planned = state.agents.some((agent) => agent.state !== 'Planned');
  const stage = state.stage ?? run.stage;
  const estimate = useRunEstimate(
    run.projectId,
    stage,
    planned ? state.agents.map((agent) => agent.area) : [],
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
      {phase.kind === 'ended' ? (
        <EndedBody {...{ run, state, phase, stage, estimate }} shown={view.shown} />
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
