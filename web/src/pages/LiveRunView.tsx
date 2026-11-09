import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { RunRow } from '../api/run-schemas.js';
import { cancelRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { usePublishRunMeter, type RunMeterReading } from '../app/run-meter-signal.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import { runMeterReadingOf } from '../lib/live-run/run-meter-reading.js';
import { runIsLocal } from '../lib/live-run/run-local.js';
import { runTitleOf } from '../lib/live-run/run-title.js';
import type { RunState, SourceState } from '../lib/live-run/run-state.js';
import { roleTotalsOf } from '../lib/live-run/run-summary.js';
import { EndedBody } from './EndedBody.js';
import { RunJourneys, WorkingJourney } from './JourneyPlacement.js';
import { PauseUpdates } from './PauseUpdates.js';
import { RunAnswerControls } from './ApprovalControl.js';
import type { ApprovedView } from '../lib/live-run/approved-line.js';
import { ApprovedViewContext } from './approved-view-context.js';
import { AreaReadContext } from './area-read-context.js';
import { RunStatusBar, type PartlyRead } from './RunStatusBar.js';
import type { AreaReadState } from './area-read-context.js';
import { RunningBody } from './RunningBody.js';
import { usePauseUpdates } from './use-pause-updates.js';
import { useAreaRead } from './use-area-read.js';
import { useUnderstanding, type UnderstandingLoad } from './use-understanding.js';
import { useApprovedView } from './use-approved-view.js';
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
 * tokens against the token cap when every model the run uses is local (P5-07, from `run.started`), else the cost against its cap.
 */
// RF-1003
function meterOf(
  page: { readonly state: RunState; readonly run: RunRow; readonly phase: RunPhase },
  approved: ApprovedView | undefined,
): RunMeterReading | undefined {
  const { state, run, phase } = page;
  if (phase.kind !== 'running') return undefined;
  return runMeterReadingOf({
    approved,
    caps: state.caps,
    costMicros: costOf(state, run),
    tokens: tokensOf(state),
    local: runIsLocal(state),
  });
}

/** P8-24: the approved amount of the run's journey; the top bar meter reads it too. */
function useApproved(page: {
  readonly state: RunState;
  readonly run: RunRow;
  readonly phase: RunPhase;
}): ApprovedView | undefined {
  const { state, run, phase } = page;
  const approved = useApprovedView({
    projectId: run.projectId,
    refresh: phase.kind === 'ended' ? phase.endState : phase.kind,
    spent: { micros: costOf(state, run), tokens: tokensOf(state) },
    local: runIsLocal(state),
  });
  usePublishRunMeter(meterOf(page, approved));
  return approved;
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
export function LiveRunView(props: LiveRunViewProps): JSX.Element {
  const { run, stream, phase } = props;
  const approved = useApproved({ state: stream.state, run, phase });
  return (
    <ApprovedViewContext.Provider value={approved}>
      <LiveRunContent {...props} />
    </ApprovedViewContext.Provider>
  );
}

function PageBody(props: {
  readonly run: RunRow;
  readonly state: RunState;
  readonly phase: RunPhase;
  readonly stage: string;
  readonly estimate: ReturnType<typeof useRunEstimate>;
  readonly understanding: UnderstandingLoad;
  readonly onResumed: () => void;
  readonly view: ReturnType<typeof usePauseUpdates>;
}): JSX.Element {
  const { run, state, phase, stage, estimate, onResumed, view, understanding } = props;
  return (
    <>
      {phase.kind === 'ended' ? (
        <EndedBody
          {...{ run, state, phase, stage, estimate, onResumed, understanding }}
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
    </>
  );
}

/**
 * P8-93: the areas read below the coverage bar and the share of the first-party code the run read
 * (the figure of its summary), for the "Partly read: 16% of your code" badge of the head.
 */
function partlyReadOf(read: AreaReadState, understanding: UnderstandingLoad): PartlyRead {
  const areas = read.reading.status === 'known' ? read.reading.partly.size : 0;
  const measures = understanding.status === 'ready' ? understanding.understanding.measures : null;
  return { areas, share: measures?.firstPartyCoverage };
}

/**
 * RF-230, RF-231, P7-02 (P8-130): an understand run that ended with no error, or stopped at its cap
 * (RST-1600), has measures, so the head names the share for a capped run as the History row does.
 */
function hasMeasures(state: RunState): boolean {
  const ended = state.ended;
  return ended?.errorCode === undefined || ended.endState === 'CapReached';
}

/** P8-93: what the coverage and the summary of the run say, read once for the head and the body. */
function useReading(
  props: Pick<LiveRunViewProps, 'run' | 'phase'> & {
    readonly state: RunState;
    /** The state the panels show: the one frozen by Pause updates, which freezes the coverage too. */
    readonly shown: RunState;
  },
  stage: string,
): { readonly read: AreaReadState; readonly understanding: UnderstandingLoad } {
  const { run, phase, state } = props;
  const read = useAreaRead(run, stage, props.shown);
  const asks = phase.kind === 'ended' && stage === 'understand' && hasMeasures(state);
  return { read, understanding: useUnderstanding(run.id, asks) };
}

function LiveRunContent({ run, stream, phase, onResumed }: LiveRunViewProps): JSX.Element {
  const { state } = stream;
  const view = usePauseUpdates(state);
  const stop = useStop(run.id);
  const planned = state.agents.some((agent) => agent.state !== 'Planned');
  const stage = state.stage ?? run.stage;
  const { read, understanding } = useReading({ run, phase, state, shown: view.shown }, stage);
  const estimate = useRunEstimate(
    run.projectId,
    stage,
    planned ? state.agents.map((agent) => agent.area) : [],
  );
  return (
    <AreaReadContext.Provider value={read}>
      <div class="rst-live">
        <RunStatusBar
          title={runTitleOf({ stage, phase, state })}
          {...{ phase, projectId: run.projectId, runKey: run.runId }}
          failedAreas={state.ended?.failedAreas ?? run.failedAreas}
          unreadAreas={state.ended?.unreadAreas ?? run.unreadAreas}
          partlyRead={partlyReadOf(read, understanding)}
          {...{
            stopping: stop.stopping,
            busy: stop.busy,
            stopError: stop.error,
            onStop: stop.stop,
          }}
          updatesNote={view.note}
          resume={<RunAnswerControls {...{ phase, onResumed, runId: run.id, stage }} />}
          controls={
            view.paused || phase.kind === 'running' ? (
              <PauseUpdates paused={view.paused} waiting={view.waiting} onToggle={view.toggle} />
            ) : null
          }
        />
        <Connection stream={stream} />
        <RunJourneys {...{ run, stage, phase, onResumed }} />
        <PageBody {...{ run, state, phase, stage, estimate, onResumed, view, understanding }} />
        <WorkingJourney {...{ run, stage, phase, onResumed }} />
      </div>
    </AreaReadContext.Provider>
  );
}
