import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { getEstimate } from '../api/runs.js';
import { useApp } from '../app/app-context.js';

// RF-425, RF-200: loads the estimate of an understand run for the start page. A project without a
// completed scan answers RST-1203 and has no estimate yet (`none`). A call with no areas named is
// not made (the server reads an empty list as every area), so the last answer stays.

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

// RF-425
export function useEstimate(request: EstimateRequest): EstimateLoad {
  const { client } = useApp();
  const [state, setState] = useState<EstimateLoad>({ status: 'loading' });
  const { projectId, areas, version } = request;
  const key = areas?.join('\n');
  useEffect(() => {
    if (areas?.length === 0) return undefined;
    const abort = new AbortController();
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    void getEstimate(client, projectId, areas, abort.signal).then((result) => {
      if (!abort.signal.aborted) setState(loadOf(result));
    });
    return () => {
      abort.abort();
    };
    // `key` stands for `areas`: a new array with the same names is the same request.
  }, [client, projectId, key, version]);
  return state;
}
