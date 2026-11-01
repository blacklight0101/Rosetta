import type { JSX } from 'preact';
import { useRouteParams } from '../app/route-params.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { StartRunForm } from './StartRunForm.js';
import { useProject } from './use-project.js';

// RF-1001, RF-1105, design-system.md section 14 (Start run): `/projects/:projectId`. Another
// user's project answers 404 like an unknown one, and the page shows that error and no form.

// RF-1001
export function StartRunPage(): JSX.Element {
  const projectId = useRouteParams()['projectId'] ?? '';
  const state = useProject(projectId);
  if (state.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the project
      </p>
    );
  }
  if (state.status === 'failed') {
    return (
      <div class="rst-start">
        <h1 class="rst-page__title">Start a run</h1>
        <ErrorBanner error={state.error} />
      </div>
    );
  }
  return <StartRunForm key={state.project.id} project={state.project} />;
}
