import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { getCatalogue, getPlanningBrief } from '../api/plan.js';
import type { BriefView, Catalogue } from '../api/plan-schemas.js';
import { useApp } from '../app/app-context.js';

// RF-605, RF-606: loads the catalogue and the planning brief of one of the signed-in user's
// projects. Another user's project answers 404 like an unknown one, so the page shows that error.

export type SetupLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly catalogue: Catalogue; readonly view: BriefView };

// RF-605
export function usePlanSetupLoad(projectId: string): SetupLoad {
  const { client } = useApp();
  const [state, setState] = useState<SetupLoad>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    setState({ status: 'loading' });
    void Promise.all([
      getCatalogue(client, abort.signal),
      getPlanningBrief(client, projectId, abort.signal),
    ]).then(([catalogue, view]) => {
      if (abort.signal.aborted) return;
      if (!catalogue.ok) setState({ status: 'failed', error: catalogue.error });
      else if (!view.ok) setState({ status: 'failed', error: view.error });
      else setState({ status: 'ready', catalogue: catalogue.value, view: view.value });
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId]);
  return state;
}
