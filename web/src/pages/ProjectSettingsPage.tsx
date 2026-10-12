import type { JSX } from 'preact';
import { useRouteParams } from '../app/route-params.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { ProjectSettingsForm } from './ProjectSettingsForm.js';
import { useProject } from './use-project.js';

// RF-002, RF-1105, DEC-116, DEC-117, design-system.md section 14: the settings of one project
// (models per role, caps, ignore rules, price overrides). The numbers are plain number fields; the
// sliders with their warnings are card P2-15. Another user's project answers 404 like an unknown
// one, and the page shows that error and no form.

// RF-002
export function ProjectSettingsPage(): JSX.Element {
  const state = useProject(useRouteParams()['projectId'] ?? '');
  if (state.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the project
      </p>
    );
  }
  if (state.status === 'failed') {
    return (
      <div class="rst-settings">
        <h1 class="rst-page__title">Project settings</h1>
        <ErrorBanner error={state.error} />
      </div>
    );
  }
  const { project } = state;
  return (
    <div class="rst-settings">
      <div>
        <h1 class="rst-page__title">Project settings</h1>
        <p class="rst-settings__lead">
          <span class="rst-mono">{project.name}</span>
        </p>
        <p class="rst-settings__note">
          One save replaces all of these settings. The server refuses a value outside its allowed
          range and names the field.
        </p>
      </div>
      <ProjectSettingsForm key={project.id} project={project} />
    </div>
  );
}
