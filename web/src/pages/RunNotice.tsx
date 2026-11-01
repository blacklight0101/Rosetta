import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Link } from '../components/Link.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { queueText } from '../lib/live-run/queue-text.js';

// RF-1108, RF-1001, design-system.md section 14 (queue notice): what the page says after Start. A
// run that began is shown as started; a queued one shows its position and a Cancel button, and
// starts by itself when a slot frees. Both link to the live page of the run (P1-35). A cancelled
// one says so and the page can start again.

export type RunNoticeState =
  | { readonly kind: 'started'; readonly stage: string; readonly runId: string }
  | {
      readonly kind: 'queued';
      readonly runId: string;
      readonly position: number;
      readonly cancelError: ApiFailure | undefined;
    }
  | { readonly kind: 'cancelled' };

export interface RunNoticeProps {
  readonly notice: RunNoticeState;
  readonly busy: boolean;
  readonly onCancel: () => void;
}

function LiveLink({ runId }: { readonly runId: string }): JSX.Element {
  return (
    <p>
      <Link href={`/runs/${encodeURIComponent(runId)}`}>Open the live run</Link>
    </p>
  );
}

const articleOf = (word: string): string => (/^[aeiou]/iu.test(word) ? 'an' : 'a');

function Body({ notice, busy, onCancel }: RunNoticeProps): JSX.Element {
  switch (notice.kind) {
    case 'started':
      return (
        <>
          <p>
            Run started. It is {articleOf(notice.stage)} {notice.stage} run; it is running now.
          </p>
          <LiveLink runId={notice.runId} />
        </>
      );
    case 'cancelled':
      return <p>The queued run was cancelled. Nothing was started.</p>;
    case 'queued':
      return (
        <>
          <p>
            <StatusBadge list="RunQueueState" value="Queued" /> Waiting in the queue at{' '}
            {queueText(notice.position)}. The run starts by itself when the server has a free slot.
          </p>
          <LiveLink runId={notice.runId} />
          {notice.cancelError === undefined ? null : <ErrorBanner error={notice.cancelError} />}
          <div>
            <Button busy={busy} onClick={onCancel}>
              Cancel queued run
            </Button>
          </div>
        </>
      );
  }
}

// RF-1108
export function RunNotice(props: RunNoticeProps): JSX.Element {
  return (
    <section class="rst-callout rst-callout--info" role="status" data-testid="run-notice">
      <Body {...props} />
    </section>
  );
}
