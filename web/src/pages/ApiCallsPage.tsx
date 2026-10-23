import type { JSX } from 'preact';
import type { RunLogs } from '../api/call-schemas.js';
import { getRunLogs } from '../api/calls.js';
import type { ApiFailure } from '../api/client.js';
import { useRouteParams } from '../app/route-params.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Link } from '../components/Link.js';
import { CallSummary } from './CallSummary.js';
import { CallsPanel } from './CallsPanel.js';
import { LogsPanel } from './LogsPanel.js';
import { useRunCalls } from './use-run-calls.js';
import { usePolled, type Polled } from './use-polled.js';

// RF-1011, RF-408, RF-1105: `/runs/:runId/calls`, the "API calls" and "Logs" panels of a run, named by
// the run's id (the UUID). The calls and the log are read again every few seconds while the run goes
// on. Another user's run answers 404 like an unknown one and no panel is drawn. Styles are under
// `.rst-p137-`.

function Head({ runId, runKey }: { readonly runId: string; readonly runKey: string }): JSX.Element {
  return (
    <div class="rst-p137-title">
      <h1 class="rst-page__title">API calls and logs</h1>
      {runKey === '' ? null : <span class="rst-mono rst-p137-title__key">{runKey}</span>}
      <span class="rst-p137-title__spacer" />
      <Link href={`/runs/${encodeURIComponent(runId)}`}>Live run</Link>
    </div>
  );
}

function LogsSection({ logs }: { readonly logs: Polled<RunLogs> }): JSX.Element {
  if (logs.status === 'ready') return <LogsPanel logs={logs.value} />;
  if (logs.status === 'failed') return <ErrorBanner error={logs.error} />;
  return (
    <p class="rst-loading" role="status">
      Loading the log
    </p>
  );
}

function Failed({
  runId,
  error,
}: {
  readonly runId: string;
  readonly error: ApiFailure;
}): JSX.Element {
  return (
    <div class="rst-p137-page">
      <Head runId={runId} runKey="" />
      <ErrorBanner error={error} />
    </div>
  );
}

// RF-1011
export function ApiCallsPage(): JSX.Element {
  const runId = useRouteParams()['runId'] ?? '';
  const calls = useRunCalls(runId);
  const logs = usePolled((client, signal) => getRunLogs(client, runId, signal), runId);
  if (calls.status === 'failed') return <Failed runId={runId} error={calls.error} />;
  if (calls.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the calls
      </p>
    );
  }
  const { head } = calls;
  return (
    <div class="rst-p137-page">
      <Head runId={runId} runKey={head.runKey} />
      <CallSummary rows={head.summary} />
      <CallsPanel
        runId={runId}
        calls={calls.calls}
        total={head.total}
        more={{ available: calls.hasMore, loading: calls.loadingMore, onLoad: calls.loadMore }}
      />
      <LogsSection logs={logs} />
    </div>
  );
}
