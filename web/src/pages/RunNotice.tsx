import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { StatusBadge } from '../components/StatusBadge.js';

// RF-1108, RF-1001, design-system.md section 14 (queue notice): what the page says after Start. A
// run that began is shown as started; a queued one shows its position and a Cancel button, and
// starts by itself when a slot frees. A cancelled one says so and the page can start again.

export type RunNoticeState =
  | { readonly kind: 'started'; readonly stage: string }
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

function Body({ notice, busy, onCancel }: RunNoticeProps): JSX.Element {
  switch (notice.kind) {
    case 'started':
      return <p>Run started. It is a {notice.stage} run; it is running now.</p>;
    case 'cancelled':
      return <p>The queued run was cancelled. Nothing was started.</p>;
    case 'queued':
      return (
        <>
          <p>
            <StatusBadge list="RunQueueState" value="Queued" /> Waiting in the queue at position{' '}
            {notice.position}. The run starts by itself when the server has a free slot.
          </p>
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
