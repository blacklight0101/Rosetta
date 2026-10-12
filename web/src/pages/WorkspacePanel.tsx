import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { openWorkspace } from '../api/admin.js';
import type { Workspace } from '../api/admin-schemas.js';
import type { ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-1105, RF-1109: the projects of another account, read only. Opening a workspace writes an
// `admin.workspace_opened` audit row on the server; the page has no way to change what it shows.

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly workspace: Workspace };

function useWorkspace(userId: string): LoadState {
  const { client } = useApp();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    setState({ status: 'loading' });
    void openWorkspace(client, userId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'ready', workspace: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, userId]);
  return state;
}

function ProjectList({ workspace }: { readonly workspace: Workspace }): JSX.Element {
  if (workspace.projects.length === 0) {
    return <p>{`${workspace.owner.displayName} has no projects yet.`}</p>;
  }
  return (
    <ScrollRegion label="Projects table">
      <table class="rst-table">
        <caption class="rst-visually-hidden">Projects of this account</caption>
        <thead>
          <tr>
            <th scope="col">Repository</th>
            <th scope="col">Branch or tag</th>
            <th scope="col">Folder</th>
            <th scope="col">Added</th>
          </tr>
        </thead>
        <tbody>
          {workspace.projects.map((project) => (
            <tr key={project.id}>
              <td>
                <span class="rst-mono">{project.name}</span>
              </td>
              <td>{project.ref === '' ? 'default branch' : project.ref}</td>
              <td>{project.subpath === '' ? 'whole repository' : project.subpath}</td>
              <td>{project.createdAt.slice(0, 'YYYY-MM-DD'.length)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

// RF-1105
export function WorkspacePanel(props: {
  readonly account: { readonly id: string; readonly userName: string };
  readonly onClose: () => void;
}): JSX.Element {
  const { account, onClose } = props;
  const state = useWorkspace(account.id);
  if (state.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        {`Loading the workspace of ${account.userName}`}
      </p>
    );
  }
  return (
    <section
      class="rst-card rst-settings__section"
      aria-labelledby="workspace-title"
      data-testid="workspace-panel"
    >
      <h2 id="workspace-title" class="rst-settings__heading">
        {`Workspace of ${account.userName}`}
      </h2>
      <p class="rst-settings__note">Read only. Opening it is recorded in the audit.</p>
      {state.status === 'failed' ? <ErrorBanner error={state.error} /> : null}
      {state.status === 'ready' ? <ProjectList workspace={state.workspace} /> : null}
      <div class="rst-projects__actions">
        <Button onClick={onClose}>Close</Button>
      </div>
    </section>
  );
}
