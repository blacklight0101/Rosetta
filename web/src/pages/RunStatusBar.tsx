import type { ComponentChildren, JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { FailedAreasNote } from '../components/FailedAreasNote.js';
import { Link } from '../components/Link.js';
import { RunEndBadge } from '../components/RunEndBadge.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { stateLists } from '../components/badge-specs.js';
import { queueText } from '../lib/live-run/queue-text.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';

// RF-1002, RF-1003, RF-1108, design-system.md section 14 (live run): the head of the page: the run's
// folder name, stage, state and the Stop button. A running run is stopped, a queued one is
// cancelled; after the request the page says it is stopping until the run's own end arrives.

export interface RunStatusBarProps {
  readonly runKey: string;
  readonly stage: string;
  readonly projectId: string;
  readonly phase: RunPhase;
  /** RF-208: the areas of the run that gave no usable card, shown next to an ended state. */
  readonly failedAreas?: number;
  /** P7-02: the planned areas no reader started, for "Partly read". */
  readonly unreadAreas?: number;
  readonly stopping: boolean;
  readonly busy: boolean;
  readonly stopError: ApiFailure | undefined;
  readonly onStop: () => void;
  /** What the page status says about Pause updates (`Updates paused`), if anything. */
  readonly updatesNote?: string | undefined;
  /** Controls beside Stop run, for example Pause updates. */
  readonly controls?: ComponentChildren;
  /**
   * RF-006: the Resume button of an ended run that can be resumed, and why it may need a raised cap;
   * RF-432: Continue (+N) and Stop here of a run waiting for its owner's approval.
   */
  readonly resume?: ComponentChildren;
}

function Badge({
  phase,
  unreadAreas,
}: {
  readonly phase: RunPhase;
  readonly unreadAreas?: number | undefined;
}): JSX.Element {
  if (phase.kind === 'queued') return <StatusBadge list="RunQueueState" value="Queued" />;
  if (phase.kind === 'running') return <StatusBadge list="RunQueueState" value="Running" />;
  if (phase.kind === 'awaiting') {
    return <StatusBadge list="RunQueueState" value="AwaitingApproval" />;
  }
  const endState = stateLists.RunEndState.find((each) => each === phase.endState);
  return endState === undefined ? (
    <StatusBadge list="RunQueueState" value="Ended" />
  ) : (
    <RunEndBadge endState={endState} unreadAreas={unreadAreas} />
  );
}

/** EV-80: the place of a queued run and the runs ahead of it. */
function QueuePlace({ phase }: { readonly phase: RunPhase }): JSX.Element | null {
  if (phase.kind !== 'queued' || phase.position === null || phase.position === undefined) {
    return null;
  }
  return (
    <span class="rst-live-head__note" data-testid="queue-position">
      {queueText(phase.position)}
    </span>
  );
}

// RF-1003, RF-1108
export function RunStatusBar(props: RunStatusBarProps): JSX.Element {
  const { phase, stopping } = props;
  return (
    <>
      <div class="rst-live-head">
        <div class="rst-live-head__title">
          <h1 class="rst-page__title">Live run</h1>
          <span class="rst-mono rst-live-head__key">{props.runKey}</span>
          <span class="rst-live-head__stage">{props.stage}</span>
          <Link href={`/projects/${encodeURIComponent(props.projectId)}/start`}>Start page</Link>
        </div>
        <span role="status" data-testid="run-status" class="rst-live-head__state">
          <Badge phase={phase} unreadAreas={props.unreadAreas} />
          <QueuePlace phase={phase} />
          {phase.kind === 'ended' ? (
            <FailedAreasNote count={props.failedAreas ?? 0} class="rst-live-head__note" />
          ) : null}
          {stopping && phase.kind !== 'ended' ? (
            <span class="rst-live-head__note">Stopping…</span>
          ) : null}
          <span class="rst-live-head__note rst-live-pause-note">{props.updatesNote}</span>
        </span>
        <span class="rst-live-pause-actions">
          {props.controls}
          {/* RF-432: a paused run is answered with Continue or Stop here (the resume slot). */}
          {phase.kind === 'ended' || phase.kind === 'awaiting' ? (
            props.resume
          ) : (
            <Button
              variant="danger"
              busy={props.busy}
              {...(stopping ? { disabledReason: 'The run is stopping.' } : {})}
              onClick={props.onStop}
            >
              {phase.kind === 'queued' ? 'Cancel queued run' : 'Stop run'}
            </Button>
          )}
        </span>
      </div>
      {props.stopError === undefined ? null : <ErrorBanner error={props.stopError} />}
    </>
  );
}
