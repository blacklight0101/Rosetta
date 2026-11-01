import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { scanSubjectOf } from '../lib/live-run/scan-subject.js';
import { queueText } from '../lib/live-run/queue-text.js';
import { hasSourceOf } from './use-auto-scan.js';
import type { StartForm } from './use-start-form.js';

// RF-160, ADR-027: what the page says while the free scan that started by itself is not done: it is
// running (with its place when queued), it did not finish (with the error, and Scan again), or the
// project has no source yet. The areas and the estimate replace it when the scan ends.

function Body({ form }: { readonly form: StartForm }): JSX.Element {
  const { scan, project } = form;
  if (!hasSourceOf(project)) {
    return (
      <p class="rst-settings__note" data-testid="scan-needs-source">
        Add the source above: the scan starts by itself.
      </p>
    );
  }
  const { state } = scan;
  if (state.kind === 'failed') {
    return (
      <>
        {state.error === undefined ? (
          <p>The scan did not finish. Scan again, or open the History to see why.</p>
        ) : (
          <ErrorBanner error={state.error} />
        )}
        <div>
          <Button onClick={scan.scanAgain}>Scan again</Button>
        </div>
      </>
    );
  }
  const place =
    state.kind === 'scanning' && state.position !== null
      ? `; waiting in the queue at ${queueText(state.position)}`
      : '';
  return (
    <p role="status" data-testid="scan-running">
      Scanning {scanSubjectOf(project.sourceKind)}. It is free and makes no model calls
      {place}. The areas found and one estimate for the whole journey appear here when it ends.
    </p>
  );
}

// RF-160
export function ScanSection({ form }: { readonly form: StartForm }): JSX.Element {
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="scan-heading">
      <h2 id="scan-heading" class="rst-settings__heading">
        Scan
      </h2>
      <Body form={form} />
    </section>
  );
}
