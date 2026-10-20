import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { startRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { navigate } from '../app/router.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Link } from '../components/Link.js';
import { failedAreasOf } from '../lib/live-run/run-summary.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-208, RF-1002, design-system.md section 14 (live run): a run in which some areas gave no usable
// card is never shown as a plain success. Under the head of the page it says how many areas failed
// and why, and offers "Retry failed areas": a new run of those areas alone. The retry asks for no
// cloud consent of its own; a project that needs it is sent to the start page to give it.

const NO_CONSENT = 'RST-1515';

export interface FailedAreasProps {
  readonly state: RunState;
  readonly projectId: string;
  /** The run the notice is about (its id): a completed run is retried as a linked run (Q-43). */
  readonly runId: string;
}

function headline(endState: string, count: number): string {
  const areas = count === 1 ? '1 area' : `${String(count)} areas`;
  return endState === 'Completed' ? `Completed with ${areas} failed` : `${areas} failed`;
}

/** Q-43: a run that ended Completed is retried as a linked run; any other is read again as a plain run. */
function retryTarget(endState: string | undefined, runId: string): string | undefined {
  return endState === 'Completed' ? runId : undefined;
}

function useRetry(projectId: string, areas: readonly string[], retryOf: string | undefined) {
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>();
  const retry = (): void => {
    setBusy(true);
    setError(undefined);
    const request = { stage: 'understand', areas, cloudConsent: false } as const;
    void startRun(client, projectId, {
      ...request,
      ...(retryOf === undefined ? {} : { retryOf }),
    }).then((result) => {
      setBusy(false);
      if (result.ok) navigate(`/runs/${encodeURIComponent(result.value.id)}`);
      else setError(result.error);
    });
  };
  return { busy, error, retry };
}

// RF-208
export function FailedAreas({ state, projectId, runId }: FailedAreasProps): JSX.Element | null {
  const failed = failedAreasOf(state);
  const endState = state.ended?.endState;
  const retry = useRetry(
    projectId,
    failed.map((each) => each.area),
    retryTarget(endState, runId),
  );
  if (endState === undefined || endState === 'Interrupted' || failed.length === 0) return null;
  return (
    <section class="rst-callout rst-callout--warn" data-testid="failed-areas">
      <p class="rst-callout__message">
        {headline(endState, state.ended?.failedAreas ?? failed.length)}
      </p>
      <p class="rst-callout__next-step">The specification has nothing about these areas yet.</p>
      <ul>
        {failed.map((each) => (
          <li key={each.area}>
            {each.area}: {each.why}
          </li>
        ))}
      </ul>
      <Button variant="primary" busy={retry.busy} onClick={retry.retry}>
        Retry failed areas
      </Button>
      {retry.error === undefined ? null : <ErrorBanner error={retry.error} />}
      {retry.error?.code === NO_CONSENT ? (
        <Link href={`/projects/${encodeURIComponent(projectId)}/start`}>Start page</Link>
      ) : null}
    </section>
  );
}
