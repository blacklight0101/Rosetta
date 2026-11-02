import type { JSX } from 'preact';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { PlanSetupBody } from './PlanSetupPage.js';
import { usePlanSetupLoad } from './use-plan-setup-load.js';

// RF-1021, DEC-204: the questions and the plan setup of a project drawn inside its journey strip, so
// the user answers, sets up and starts the plan without leaving the project page. It reads and
// writes through the same calls and parts as the Plan setup page.

export function PlanSetupInPlace(props: {
  readonly projectId: string;
  readonly onSaved: () => void;
}): JSX.Element {
  const load = usePlanSetupLoad(props.projectId);
  if (load.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the questions and the plan setup
      </p>
    );
  }
  if (load.status === 'failed') return <ErrorBanner error={load.error} />;
  return (
    <PlanSetupBody
      {...{ projectId: props.projectId, catalogue: load.catalogue, view: load.view }}
      {...{ project: load.project, source: load.source, sourceError: load.sourceError }}
      {...{ sourceRunId: load.sourceRunId, embedded: true, onSaved: props.onSaved }}
    />
  );
}
