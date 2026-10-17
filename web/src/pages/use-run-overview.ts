import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { getOverview, type RunOverviewData } from '../api/overview.js';
import { useApp } from '../app/app-context.js';

// RF-264: the overview of a run, read once the run has ended (the run writes it as its last step).

export type OverviewLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly overview: RunOverviewData | null };

// RF-264
export function useRunOverview(runId: string): OverviewLoad {
  const { client } = useApp();
  const [load, setLoad] = useState<OverviewLoad>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    setLoad({ status: 'loading' });
    void getOverview(client, runId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setLoad(
        result.ok
          ? { status: 'ready', overview: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, runId]);
  return load;
}
