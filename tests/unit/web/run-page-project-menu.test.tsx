import type { JSX } from 'preact';
import { render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../web/src/api/client.js';
import { App } from '../../../web/src/app/App.js';
import { routes as realRoutes } from '../../../web/src/app/routes.js';
import { useAnnounceRunProject } from '../../../web/src/app/run-project-signal.js';
import { failure, json, renderPage } from './fake-api.js';
import { runRow, runUuid, runPath } from './live-run-helpers.js';
import { projectOf } from './project-fixtures.js';
import { LiveRunPage } from '../../../web/src/pages/LiveRunPage.js';
import { StreamServer } from './stream-server.js';

// RF-1002, RF-1105, P1-175 (P8-27, UX-26): a run page opened by its address keeps the project in the
// side menu: the page tells the shell which project its run belongs to.

afterEach(() => {
  window.sessionStorage.clear();
  window.history.pushState({}, '', '/');
  vi.unstubAllGlobals();
});

function RunStandIn(): JSX.Element {
  useAnnounceRunProject('p-7');
  return <h1>Run</h1>;
}

const routes = realRoutes.map((route) => ({
  ...route,
  component: route.path === '/runs/:runId' ? RunStandIn : () => <h1>{route.title}</h1>,
}));

function appAt(path: string) {
  window.history.pushState({}, '', path);
  const fetchFn: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === '/api/session') {
      return Promise.resolve(
        json(200, {
          user: { id: 'u-1', userName: 'ana', displayName: 'Ana', role: 'user', state: 'Active' },
          csrfToken: 'c',
        }),
      );
    }
    if (url === '/api/projects/p-7')
      return Promise.resolve(json(200, projectOf('p-7', 'octo/demo')));
    return Promise.resolve(failure(404, 'RST-2003'));
  };
  return render(
    <App client={createApiClient({ fetch: fetchFn })} routes={routes} assign={vi.fn()} />,
  );
}

it('P8-27 a run page opened by its address keeps the pages of its project in the side menu', async () => {
  appAt('/runs/run-1');

  const group = within(await screen.findByTestId('nav-group-project'));
  expect(await group.findByText('Project: octo/demo')).not.toBeNull();
  expect(group.queryByText('Open a project to see its pages')).toBeNull();
  expect(group.getByRole('link', { name: 'History' }).getAttribute('href')).toBe(
    '/projects/p-7/history',
  );
});

it('P8-27 the live run page announces the project of its run', async () => {
  const announce = vi.fn<(projectId: string | undefined) => void>();
  const { RunProjectContext } = await import('../../../web/src/app/run-project-signal.js');
  const stream = new StreamServer();
  vi.stubGlobal('fetch', stream.send);
  renderPage(
    <RunProjectContext.Provider value={announce}>
      <LiveRunPage />
    </RunProjectContext.Provider>,
    { [`GET ${runPath}`]: runRow() },
    undefined,
    { runId: runUuid },
  );

  await waitFor(() => {
    expect(announce).toHaveBeenCalledWith('p-1');
  });
});
