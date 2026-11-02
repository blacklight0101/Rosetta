import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { getJourney } from '../api/journey.js';
import { getEstimate } from '../api/runs.js';
import { useApp } from '../app/app-context.js';

// RF-425, RF-200: loads the estimate of an understand run for the start page. A project without a
// completed scan answers RST-1203 and has no estimate yet (`none`). A call with no areas named is
// not made (the server reads an empty list as every area), so the last answer stays. The estimate
// is not asked for before a scan has finished, since the server would answer 409 and the browser
// logs that; the journey says whether one has (a journey that cannot be read does not stop the ask).

const NO_CODE_MAP = 'RST-1203';

export type EstimateLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'none' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly estimate: RunEstimate };

export interface EstimateRequest {
  readonly projectId: string;
  /** The areas to estimate; undefined for every area. */
  readonly areas: readonly string[] | undefined;
  /** Changes when the user asks for the estimate again. */
  readonly version: number;
}

function loadOf(result: Awaited<ReturnType<typeof getEstimate>>): EstimateLoad {
  if (result.ok) return { status: 'ready', estimate: result.value };
  if (result.error.code === NO_CODE_MAP) return { status: 'none' };
  return { status: 'failed', error: result.error };
}

/** Whether the project has a finished scan; undefined until the journey answers, true when it cannot be read. */
function useScanned(projectId: string, version: number): boolean | undefined {
  const { client } = useApp();
  const [scanned, setScanned] = useState<boolean | undefined>();
  useEffect(() => {
    const abort = new AbortController();
    void getJourney(client, { projectId }, abort.signal).then((result) => {
      if (!abort.signal.aborted) setScanned(!result.ok || result.value.scanRunId !== null);
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId, version]);
  return scanned;
}

// RF-425
export function useEstimate(request: EstimateRequest): EstimateLoad {
  const { client } = useApp();
  const [loaded, setState] = useState<{ key: string | undefined; load: EstimateLoad }>({
    key: undefined,
    load: { status: 'loading' },
  });
  const { projectId, areas, version } = request;
  const scanned = useScanned(projectId, version);
  const key = areas?.join('\n');
  useEffect(() => {
    if (scanned === undefined || areas?.length === 0) return undefined;
    if (!scanned) {
      setState({ key, load: { status: 'none' } });
      return undefined;
    }
    const abort = new AbortController();
    setState((current) =>
      current.load.status === 'ready' ? current : { key: current.key, load: { status: 'loading' } },
    );
    void getEstimate(client, projectId, areas, abort.signal).then((result) => {
      if (!abort.signal.aborted) setState({ key, load: loadOf(result) });
    });
    return () => {
      abort.abort();
    };
    // `key` stands for `areas`: a new array with the same names is the same request.
  }, [client, projectId, key, version, scanned]);
  // A figure for other areas than the ones asked for is not the one to approve (RF-432): it waits.
  const waiting = loaded.load.status === 'ready' && loaded.key !== key && areas?.length !== 0;
  return waiting ? { status: 'loading' } : loaded.load;
}
