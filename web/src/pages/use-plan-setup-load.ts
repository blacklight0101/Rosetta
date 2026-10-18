import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { getCatalogue, getPlanSource, getPlanningBrief } from '../api/plan.js';
import type { BriefView, Catalogue, PlanSource } from '../api/plan-schemas.js';
import { getProject } from '../api/projects.js';
import type { Project } from '../api/project-schemas.js';
import { useApp } from '../app/app-context.js';
import { useQueryParam } from '../app/query-param.js';

// RF-605, RF-606, RF-614: loads the catalogue, the planning brief, the project (whose settings name the
// planner) and the source understand run of one of the signed-in user's projects. The run is the one
// of `?run=` (Plan setup opened from a run page) or the newest completed one. Another user's project
// or run answers 404 like an unknown one, so the page shows that error; a project with no usable run
// (RST-1802) keeps the page, which shows why in the place of the run.

export type SetupLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | {
      readonly status: 'ready';
      readonly catalogue: Catalogue;
      readonly view: BriefView;
      readonly project: Project;
      /** The run the plan is written from; undefined when there is none (see `sourceError`). */
      readonly source: PlanSource | undefined;
      readonly sourceError: ApiFailure | undefined;
    };

// RF-605
export function usePlanSetupLoad(projectId: string): SetupLoad {
  const { client } = useApp();
  const runParam = useQueryParam('run');
  const [state, setState] = useState<SetupLoad>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    setState({ status: 'loading' });
    void Promise.all([
      getCatalogue(client, abort.signal),
      getPlanningBrief(client, projectId, abort.signal),
      getProject(client, projectId, abort.signal),
      getPlanSource(client, projectId, runParam, abort.signal),
    ]).then(([catalogue, view, project, source]) => {
      if (abort.signal.aborted) return;
      if (!catalogue.ok) setState({ status: 'failed', error: catalogue.error });
      else if (!view.ok) setState({ status: 'failed', error: view.error });
      else if (!project.ok) setState({ status: 'failed', error: project.error });
      else if (!source.ok && source.error.status === 404) {
        setState({ status: 'failed', error: source.error });
      } else {
        setState({
          status: 'ready',
          ...{ catalogue: catalogue.value, view: view.value },
          ...{ project: project.value, source: source.ok ? source.value : undefined },
          sourceError: source.ok ? undefined : source.error,
        });
      }
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId, runParam]);
  return state;
}
