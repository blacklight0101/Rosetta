import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { RoleEstimate } from '../api/estimate-schemas.js';
import { getEstimate, startRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { navigate } from '../app/router.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { cloudRoles } from '../lib/estimate-math.js';
import { failedAreasOf } from '../lib/live-run/run-summary.js';
import type { RunState } from '../lib/live-run/run-state.js';
import { CloudNotice } from './CloudNotice.js';

// RF-208, RF-1002, P7-38, design-system.md section 14 (live run): a run in which some areas gave no
// usable card is never shown as a plain success. Under the head of the page it says how many areas
// failed and why, and offers "Retry failed areas": a new run of those areas alone. A retry of a run
// that had cloud consent inherits it on the server. When the server refuses it for missing consent
// (RST-1515), the consent notice names the providers beside the button, and the retry starts once
// it is ticked. P8-11: when the retried run recorded no consent the box shows from the start, and the
// error of a failed estimate shows beside the button.

export interface FailedAreasProps {
  readonly state: RunState;
  readonly projectId: string;
  /** The run the notice is about (its id): a completed run is retried as a linked run (Q-43). */
  readonly runId: string;
  /** P8-11: the retried run recorded its cloud consent (the run row). */
  readonly consentRecorded: boolean;
}

function headline(endState: string, count: number): string {
  const areas = count === 1 ? '1 area' : `${String(count)} areas`;
  return endState === 'Completed' ? `Completed with ${areas} failed` : `${areas} failed`;
}

/** Q-43: a run that ended Completed is retried as a linked run; any other is read again as a plain run. */
function retryTarget(endState: string | undefined, runId: string): string | undefined {
  return endState === 'Completed' ? runId : undefined;
}

interface RetryRequest {
  readonly projectId: string;
  readonly areas: readonly string[];
  readonly retryOf: string | undefined;
  readonly consent: boolean;
  /** P8-11: the run being retried recorded its cloud consent, which a linked retry inherits. */
  readonly consentRecorded: boolean;
  /** The notice is shown at all (the run ended and areas failed). */
  readonly shown: boolean;
}

/**
 * P8-11 (P7-38): the providers the failed areas use, asked for as soon as the notice shows when the
 * retry will need the consent ticked (the retried run recorded none, or the retry is not linked to
 * it). A failed estimate shows its error beside the button.
 */
function useCloudRoles(
  request: RetryRequest,
  fail: (error: ApiFailure) => void,
): readonly RoleEstimate[] {
  const { client } = useApp();
  const { projectId, areas, retryOf, consentRecorded, shown } = request;
  const [roles, setRoles] = useState<readonly RoleEstimate[]>([]);
  const needed = shown && (retryOf === undefined || !consentRecorded);
  const key = areas.join('\n');
  useEffect(() => {
    if (!needed) return undefined;
    const abort = new AbortController();
    void getEstimate(client, projectId, key.split('\n'), abort.signal).then((estimate) => {
      if (abort.signal.aborted) return;
      if (estimate.ok) setRoles(cloudRoles(estimate.value));
      else fail(estimate.error);
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId, key, needed, fail]);
  return roles;
}

function useRetry(request: RetryRequest) {
  const { client } = useApp();
  const { projectId, areas, retryOf, consent } = request;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>();
  const roles = useCloudRoles(request, setError);
  const retry = (): void => {
    setBusy(true);
    setError(undefined);
    const request = { stage: 'understand', areas, cloudConsent: consent } as const;
    void startRun(client, projectId, {
      ...request,
      ...(retryOf === undefined ? {} : { retryOf }),
    }).then((result) => {
      setBusy(false);
      if (result.ok) {
        navigate(`/runs/${encodeURIComponent(result.value.id)}`);
        return;
      }
      setError(result.error);
    });
  };
  return { busy, error, roles, retry };
}

// RF-208
export function FailedAreas(props: FailedAreasProps): JSX.Element | null {
  const { state, projectId, runId, consentRecorded } = props;
  const [consent, setConsent] = useState(false);
  const failed = failedAreasOf(state);
  const endState = state.ended?.endState;
  const hidden = endState === undefined || endState === 'Interrupted' || failed.length === 0;
  const retry = useRetry({
    ...{ projectId, consent, consentRecorded, shown: !hidden },
    areas: failed.map((each) => each.area),
    retryOf: retryTarget(endState, runId),
  });
  if (hidden) return null;
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
      {retry.roles.length === 0 ? null : (
        <CloudNotice
          roles={retry.roles}
          consent={consent}
          error={undefined}
          onConsent={setConsent}
        />
      )}
      {/* RF-1021 (P8-84): secondary, so the page keeps its one primary action (Your turn or Resume). */}
      <Button variant="secondary" busy={retry.busy} onClick={retry.retry}>
        Retry failed areas
      </Button>
      {retry.error === undefined ? null : <ErrorBanner error={retry.error} />}
    </section>
  );
}
