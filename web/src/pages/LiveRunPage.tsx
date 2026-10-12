import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useRouteParams } from '../app/route-params.js';
import { useAnnounceUsage } from '../app/usage-signal.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { phaseOf } from '../lib/live-run/run-phase.js';
import { progressOf } from '../lib/live-run/run-summary.js';
import { LiveRunView } from './LiveRunView.js';
import { useRun } from './use-run.js';
import { useRunStream } from './use-run-stream.js';

// RF-1002, RF-1003, RF-424, RF-1004, RF-1105: `/runs/:runId`, the live page of a run, named by the
// run's id (the UUID). It reads the run first (another user's run answers 404 like an unknown one
// and no stream is opened), then follows the event stream, and reads the run again at every model
// turn so the cost so far follows it.

// RF-1002
export function LiveRunPage(): JSX.Element {
  const runId = useRouteParams()['runId'] ?? '';
  const [known, setKnown] = useState(false);
  const stream = useRunStream(runId, known);
  const progress = progressOf(stream.state);
  const load = useRun(runId, progress);
  // RF-1010: the totals pill of the header follows the run's model calls.
  useAnnounceUsage(progress);
  const status = load.status;
  useEffect(() => {
    if (status === 'ready') setKnown(true);
  }, [status]);
  if (load.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the run
      </p>
    );
  }
  if (load.status === 'failed') {
    return (
      <div class="rst-live">
        <h1 class="rst-page__title">Live run</h1>
        <ErrorBanner error={load.error} />
      </div>
    );
  }
  const phase = phaseOf(load.run, stream.state);
  return <LiveRunView key={load.run.id} run={load.run} stream={stream} phase={phase} />;
}
