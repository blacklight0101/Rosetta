import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { getJourney } from '../api/journey.js';
import type { JourneyFacts } from '../api/journey-schemas.js';
import { useApp } from '../app/app-context.js';

// RF-615: the facts of the journey of the run a page is about. The first read shows the strip or why
// it could not be read; a later read (`refresh` changed, because the run changed state) that fails
// keeps what the page has. A reload reads the same facts as a live update, so the two agree.

export type JourneyLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly facts: JourneyFacts };

// RF-615
export function useJourney(
  request: { readonly projectId: string; readonly runId: string | undefined },
  refresh: string,
): JourneyLoad {
  const { client } = useApp();
  const [state, setState] = useState<JourneyLoad>({ status: 'loading' });
  const { projectId, runId } = request;
  useEffect(() => {
    const abort = new AbortController();
    void getJourney(client, { projectId, runId }, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      if (result.ok) setState({ status: 'ready', facts: result.value });
      else
        setState((now) =>
          now.status === 'ready' ? now : { status: 'failed', error: result.error },
        );
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId, runId, refresh]);
  return state;
}
