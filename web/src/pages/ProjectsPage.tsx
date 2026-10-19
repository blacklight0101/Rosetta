import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '../components/Button.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { NewProjectForm } from './NewProjectForm.js';
import { ProjectRunsTable } from './ProjectRunsTable.js';
import { QueueNotices } from './QueueNotice.js';
import { useProjectOverview, type OverviewLoad } from './use-project-overview.js';

// RF-010, RF-1008, RF-1108, RF-1105, design-system.md section 14 (Projects): the user's projects
// with their last run, state, runs, tokens and cost (GET /api/projects/overview), the queue notice
// with Cancel queued run for a project whose latest run waits, and the New project form.

const demoUrl =
  'https://github.com/dotnet-architecture/eShopModernizing/tree/main/eShopLegacyWebFormsSolution';

function YourProjects(props: {
  readonly state: OverviewLoad;
  readonly onDemo: () => void;
  readonly onCancelled: () => void;
}): JSX.Element {
  const { state, onDemo, onCancelled } = props;
  if (state.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading your projects
      </p>
    );
  }
  if (state.status === 'failed') return <ErrorBanner error={state.error} />;
  if (state.rows.length > 0) {
    return (
      <>
        {state.truncated ? (
          <p class="rst-settings__lead" role="note">
            Only the newest 100 projects are shown. Older projects are not listed on this page.
          </p>
        ) : null}
        <QueueNotices rows={state.rows} onCancelled={onCancelled} />
        <ProjectRunsTable rows={state.rows} />
      </>
    );
  }
  return (
    <EmptyState message="No projects yet. Paste a public GitHub URL above. The demo repository, eShopLegacyWebForms, is a good first run: about 70 files, a few cents with cloud models, free on Ollama.">
      <Button onClick={onDemo}>Use the demo repository</Button>
    </EmptyState>
  );
}

// RF-010
export function ProjectsPage(): JSX.Element {
  const { state, add, reload } = useProjectOverview();
  const [url, setUrl] = useState('');
  return (
    <div class="rst-settings">
      <div>
        <h1 class="rst-page__title">Projects</h1>
        <p class="rst-settings__lead">
          Each project is one public GitHub repository or one zip of your code. Only you can see
          your projects.
        </p>
      </div>
      <section class="rst-card rst-settings__section" aria-labelledby="new-project">
        <h2 id="new-project" class="rst-settings__heading">
          New project
        </h2>
        <NewProjectForm url={url} onUrl={setUrl} onCreated={add} onStored={reload} />
      </section>
      <section class="rst-card rst-settings__section" aria-labelledby="your-projects">
        <h2 id="your-projects" class="rst-settings__heading">
          Your projects
        </h2>
        <YourProjects
          state={state}
          onDemo={() => {
            setUrl(demoUrl);
          }}
          onCancelled={reload}
        />
      </section>
    </div>
  );
}
