import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { listProjects } from '../api/projects.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Link } from '../components/Link.js';
import { NewProjectForm } from './NewProjectForm.js';

// RF-010, RF-1105, design-system.md section 14 (Projects): the user's projects and the New
// project form. The artboard also shows each project's last run, runs, tokens and cost, and a
// notice for a queued run (RF-1108); the API has no run list yet, so those wait for one.

const demoUrl =
  'https://github.com/dotnet-architecture/eShopModernizing/tree/master/eShopLegacyWebFormsSolution';

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly projects: readonly Project[] };

function useProjectList(): readonly [ListState, (project: Project) => void] {
  const { client } = useApp();
  const [state, setState] = useState<ListState>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    void listProjects(client, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'ready', projects: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client]);
  const add = (project: Project): void => {
    setState((current) => ({
      status: 'ready',
      projects: current.status === 'ready' ? [...current.projects, project] : [project],
    }));
  };
  return [state, add];
}

function ProjectRow({ project }: { readonly project: Project }): JSX.Element {
  return (
    <tr>
      <td>
        <span class="rst-mono">{project.name}</span>
      </td>
      <td>{project.ref === '' ? 'default branch' : project.ref}</td>
      <td>{project.subpath === '' ? 'whole repository' : project.subpath}</td>
      <td>{project.createdAt.slice(0, 'YYYY-MM-DD'.length)}</td>
      <td>
        <div class="rst-projects__actions">
          <Link
            href={`/projects/${encodeURIComponent(project.id)}/start`}
            class="rst-button rst-button--primary"
          >
            Start run
            <span class="rst-visually-hidden"> for {project.name}</span>
          </Link>
          <Link
            href={`/projects/${encodeURIComponent(project.id)}/settings`}
            class="rst-button rst-button--secondary"
          >
            Settings
            <span class="rst-visually-hidden"> for {project.name}</span>
          </Link>
        </div>
      </td>
    </tr>
  );
}

function ProjectTable({ projects }: { readonly projects: readonly Project[] }): JSX.Element {
  return (
    <div class="rst-table-scroll">
      <table class="rst-table">
        <caption class="rst-visually-hidden">Your projects</caption>
        <thead>
          <tr>
            <th scope="col">Repository</th>
            <th scope="col">Branch or tag</th>
            <th scope="col">Folder</th>
            <th scope="col">Added</th>
            <th scope="col">
              <span class="rst-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function YourProjects(props: {
  readonly state: ListState;
  readonly onDemo: () => void;
}): JSX.Element {
  const { state, onDemo } = props;
  if (state.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading your projects
      </p>
    );
  }
  if (state.status === 'failed') return <ErrorBanner error={state.error} />;
  if (state.projects.length > 0) return <ProjectTable projects={state.projects} />;
  return (
    <EmptyState message="No projects yet. Paste a public GitHub URL above. The demo repository, eShopLegacyWebForms, is a good first run: about 70 files, a few cents with cloud models, free on Ollama.">
      <Button onClick={onDemo}>Use the demo repository</Button>
    </EmptyState>
  );
}

// RF-010
export function ProjectsPage(): JSX.Element {
  const [state, add] = useProjectList();
  const [url, setUrl] = useState('');
  return (
    <div class="rst-settings">
      <div>
        <h1 class="rst-page__title">Projects</h1>
        <p class="rst-settings__lead">
          Each project is one public GitHub repository. Only you can see your projects.
        </p>
      </div>
      <section class="rst-card rst-settings__section" aria-labelledby="new-project">
        <h2 id="new-project" class="rst-settings__heading">
          New project
        </h2>
        <NewProjectForm url={url} onUrl={setUrl} onCreated={add} />
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
        />
      </section>
    </div>
  );
}
