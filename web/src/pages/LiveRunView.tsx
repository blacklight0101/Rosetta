import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { RunRow } from '../api/run-schemas.js';
import { cancelRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Link } from '../components/Link.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import type { RunState, SourceState } from '../lib/live-run/run-state.js';
import { AgentPanel } from './AgentPanel.js';
import { ClaimsList } from './ClaimsList.js';
import { EventLog } from './EventLog.js';
import { RunAnswers } from './RunAnswers.js';
import { RunDownloads } from './RunDownloads.js';
import { RunFailure } from './RunFailure.js';
import { RunMeter } from './RunMeter.js';
import { RunOverview } from './RunOverview.js';
import { RunStatusBar } from './RunStatusBar.js';
import { useRunEstimate } from './use-run-estimate.js';
import type { RunStream } from './use-run-stream.js';

// RF-1002, RF-1003, RF-424, RF-1004, design-system.md section 14 (live run): the page of a run that
// exists: head with Stop, downloads, the overview, the run meter, one panel per agent, the claims
// and the verbose event log. Everything shown comes from the run row and the run's events.

export interface LiveRunViewProps {
  readonly run: RunRow;
  readonly stream: RunStream;
  readonly phase: RunPhase;
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

function Agents({ state }: { readonly state: RunState }): JSX.Element {
  const emptyText =
    state.stage === 'scan'
      ? 'This run has no agents. A scan reads the repository without a model.'
      : 'No agents yet. They appear when the run plans its work.';
  return (
    <section class="rst-live-agents" aria-label="Agents">
      <h2 class="rst-live-section__title">Agents</h2>
      {state.agents.length === 0 ? (
        <p class="rst-settings__note">{emptyText}</p>
      ) : (
        <div class="rst-live-agents__grid">
          {state.agents.map((agent) => (
            <AgentPanel key={agent.agentTaskId} agent={agent} />
          ))}
        </div>
      )}
    </section>
  );
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

// RF-1002
export function LiveRunView({ run, stream, phase }: LiveRunViewProps): JSX.Element {
  const { state } = stream;
  const stop = useStop(run.id);
  const planned = state.agents.some((agent) => agent.state !== 'Planned');
  const estimate = useRunEstimate(
    run.projectId,
    state.stage ?? run.stage,
    planned ? state.agents.map((agent) => agent.area) : [],
  );
  const stage = state.stage ?? run.stage;
  return (
    <div class="rst-live">
      <RunStatusBar
        {...{ phase, stage, projectId: run.projectId, runKey: run.runId }}
        {...{ stopping: stop.stopping, busy: stop.busy, stopError: stop.error, onStop: stop.stop }}
      />
      <Connection stream={stream} />
      {state.ended?.errorCode === undefined ? null : <RunFailure code={state.ended.errorCode} />}
      <p class="rst-p137-live-link">
        <Link href={`/runs/${encodeURIComponent(run.id)}/calls`}>API calls and logs</Link>
      </p>
      <RunDownloads runId={run.id} stage={stage} ended={phase.kind === 'ended'} />
      <RunOverview state={state} />
      <RunMeter state={state} costMicros={costOf(state, run)} estimate={estimate} />
      <Agents state={state} />
      <ClaimsList claims={state.claims} source={sourceOf(state, run)} />
      {stage === 'understand' ? <RunAnswers runId={run.id} ended={phase.kind === 'ended'} /> : null}
      <EventLog lines={state.log} startedAt={state.startedAt} />
    </div>
  );
}
