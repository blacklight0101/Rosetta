import type { JSX } from 'preact';
import { Link } from '../components/Link.js';
import type { RunState } from '../lib/live-run/run-state.js';
import { EventLog } from './EventLog.js';

// RF-1002, RF-1011, RF-1015, DEC-137: the "Activity" tab: the verbose event log, and the way to the
// provider calls and the application log of the run.

// RF-1015
export function ActivityTab(props: {
  readonly state: RunState;
  readonly runId: string;
}): JSX.Element {
  return (
    <>
      <p class="rst-p137-live-link">
        <Link href={`/runs/${encodeURIComponent(props.runId)}/calls`}>API calls and logs</Link>
      </p>
      <EventLog lines={props.state.log} startedAt={props.state.startedAt} />
    </>
  );
}
