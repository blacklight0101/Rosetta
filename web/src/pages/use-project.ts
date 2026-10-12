import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { getProject } from '../api/projects.js';
import { useApp } from '../app/app-context.js';

// RF-1105: loads one project of the signed-in user for a project page. Another user's project
// answers 404 like an unknown one, so the page shows that error and no form.

export type ProjectLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly project: Project };

// RF-1105
export function useProject(projectId: string): ProjectLoad {
  const { client } = useApp();
  const [state, setState] = useState<ProjectLoad>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    setState({ status: 'loading' });
    void getProject(client, projectId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'ready', project: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId]);
  return state;
}
