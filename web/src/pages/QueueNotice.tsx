import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { ProjectOverviewRow } from '../api/overview-schemas.js';
import { cancelRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Link } from '../components/Link.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { queueText } from '../lib/live-run/queue-text.js';

// RF-1108, RF-1105, design-system.md section 14 (queue notice): one info callout for each project
// whose latest run waits in the queue, with its position, the link to its live page and "Cancel
// queued run", which stops the run by its id (POST /api/runs/:runId/stop). After a cancel the page
// reads the list again; a refused cancel shows its error in the notice and keeps the button.

interface NoticeProps {
  readonly name: string;
  readonly stage: string;
  readonly runId: string;
  readonly position: number;
  readonly onCancelled: () => void;
}

function Notice({ name, stage, runId, position, onCancelled }: NoticeProps): JSX.Element {
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>(undefined);
  const cancel = (): void => {
    setBusy(true);
    void cancelRun(client, runId).then((result) => {
      setBusy(false);
      if (result.ok) onCancelled();
      else setError(result.error);
    });
  };
  return (
    <section
      class="rst-callout rst-callout--info rst-p1105-notice"
      role="status"
      data-testid="queue-notice"
    >
      <p>
        <StatusBadge list="RunQueueState" value="Queued" /> Your {stage} run of{' '}
        <span class="rst-mono">{name}</span> is queued, {queueText(position)}. It starts by itself
        when the server has a free slot; you can leave this page.
      </p>
      <p>
        <Link href={`/runs/${encodeURIComponent(runId)}`}>Open the live run</Link>
      </p>
      {error === undefined ? null : <ErrorBanner error={error} />}
      <div>
        <Button busy={busy} onClick={cancel}>
          Cancel queued run<span class="rst-visually-hidden"> of {name}</span>
        </Button>
      </div>
    </section>
  );
}

// RF-1108
export function QueueNotices(props: {
  readonly rows: readonly ProjectOverviewRow[];
  readonly onCancelled: () => void;
}): JSX.Element {
  return (
    <div class="rst-p1105-notices">
      {props.rows.map((row) => {
        const run = row.lastRun;
        if (run?.queueState !== 'Queued' || run.position === null) return null;
        return (
          <Notice
            key={run.id}
            name={row.project.name}
            stage={run.stage}
            runId={run.id}
            position={run.position}
            onCancelled={props.onCancelled}
          />
        );
      })}
    </div>
  );
}
