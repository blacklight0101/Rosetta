import { render, screen } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../web/src/api/client.js';
import { App } from '../../../web/src/app/App.js';
import { buildNavigation } from '../../../web/src/app/navigation.js';
import { matchRoute } from '../../../web/src/app/route-match.js';
import { useRouteParams } from '../../../web/src/app/route-params.js';
import type { RouteDefinition } from '../../../web/src/app/route-types.js';
import { routes } from '../../../web/src/app/routes.js';

// RF-010, RF-1105, design-system.md sections 3 and 14: the two project pages are in the router
// table, signed-in only, and a page reads the parameters of its route from the application.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-010 lists Projects in the main navigation of a signed-in user', () => {
  const groups = buildNavigation({ routes, role: 'user', params: {}, path: '/projects' });

  const main = groups.find((group) => group.id === 'main');
  expect(main?.items.map((item) => item.label)).toContain('Projects');
  expect(main?.items.find((item) => item.label === 'Projects')).toMatchObject({
    path: '/projects',
    current: true,
  });
});

it('RF-002 matches the settings page of a project and lists it in the project navigation', () => {
  const match = matchRoute('/projects/p-7/settings', routes);

  expect(match).toMatchObject({
    params: { projectId: 'p-7' },
    route: { access: 'user', chrome: 'shell', title: 'Project settings' },
  });
  const groups = buildNavigation({
    routes,
    role: 'user',
    params: { projectId: 'p-7' },
    path: '/projects/p-7/settings',
  });
  expect(groups.find((group) => group.id === 'project')?.items).toEqual([
    { path: '/projects/p-7/start', label: 'Start a run', current: false },
    { path: '/projects/p-7/settings', label: 'Project settings', current: true },
  ]);
});

it('RF-1105 offers no project navigation outside a project', () => {
  const groups = buildNavigation({ routes, role: 'user', params: {}, path: '/projects' });

  expect(groups.find((group) => group.id === 'project')).toBeUndefined();
});

function Probe() {
  return <p>Project {useRouteParams()['projectId']}</p>;
}

it('RF-002 gives a page the parameters of its route', async () => {
  const table: readonly RouteDefinition[] = [
    {
      path: '/projects/:projectId/settings',
      title: 'Project settings',
      access: 'user',
      chrome: 'shell',
      component: Probe,
    },
  ];
  const session = {
    user: { id: 'u-1', userName: 'ana', displayName: 'Ana', role: 'user', state: 'Active' },
    csrfToken: 'csrf-1',
  };
  const fetchFn: typeof fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  window.history.pushState({}, '', '/projects/p-7/settings');

  render(<App client={createApiClient({ fetch: fetchFn })} routes={table} assign={vi.fn()} />);

  expect(await screen.findByText('Project p-7')).not.toBeNull();
});

it('RF-1001 matches the start page of a project and lists it first in the project navigation', () => {
  const match = matchRoute('/projects/p-7/start', routes);

  expect(match).toMatchObject({
    params: { projectId: 'p-7' },
    route: { access: 'user', chrome: 'shell', title: 'Start a run' },
  });
  const groups = buildNavigation({
    routes,
    role: 'user',
    params: { projectId: 'p-7' },
    path: '/projects/p-7/start',
  });
  expect(groups.find((group) => group.id === 'project')?.items[0]).toEqual({
    path: '/projects/p-7/start',
    label: 'Start a run',
    current: true,
  });
});
