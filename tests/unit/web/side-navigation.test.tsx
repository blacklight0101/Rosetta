import { act, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../web/src/api/client.js';
import { App } from '../../../web/src/app/App.js';
import { navigate } from '../../../web/src/app/router.js';
import { rememberedProject, rememberProject } from '../../../web/src/app/remembered-project.js';
import { routes as realRoutes } from '../../../web/src/app/routes.js';
import { failure, json } from './fake-api.js';
import { projectOf } from './project-fixtures.js';

// P1-175, design-system.md section 3: one side navigation on every signed-in page. The router table
// is the real one with each page reduced to its title, so the tests move between real paths.

const routes = realRoutes.map((route) => ({
  ...route,
  component: () => <h1>{route.title}</h1>,
}));
const session = (role: 'admin' | 'user') => ({
  user: { id: 'u-1', userName: 'ana', displayName: 'Ana Ruiz', role, state: 'Active' },
  csrfToken: 'csrf-1',
});

interface Setup {
  readonly role?: 'admin' | 'user';
  /** The projects the user can open, by id; any other id answers 404. */
  readonly projects?: Readonly<Record<string, string>>;
  /** What every other call answers, 404 by default. */
  readonly otherwise?: number;
}

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
const projectIdOf = (url: string): string | undefined => {
  const id = /^\/api\/projects\/([^/]+)$/u.exec(url)?.[1];
  return id === undefined ? undefined : decodeURIComponent(id);
};

function appAt(path: string, setup: Setup = {}) {
  window.history.pushState({}, '', path);
  const fetchFn: typeof fetch = (input) => {
    const url = urlOf(input);
    if (url === '/api/session') return Promise.resolve(json(200, session(setup.role ?? 'user')));
    const id = projectIdOf(url);
    const name = id === undefined ? undefined : setup.projects?.[id];
    if (id !== undefined && name !== undefined) {
      return Promise.resolve(json(200, projectOf(id, name)));
    }
    const status = setup.otherwise ?? 404;
    return Promise.resolve(failure(status, status === 404 ? 'RST-2003' : 'RST-2006'));
  };
  return render(
    <App client={createApiClient({ fetch: fetchFn })} routes={routes} assign={vi.fn()} />,
  );
}

const groupIds = (): string[] =>
  screen
    .getAllByTestId(/^nav-group-/u)
    .map((group) => group.getAttribute('data-testid')?.replace('nav-group-', '') ?? '');
const projectGroup = () => within(screen.getByTestId('nav-group-project'));

afterEach(() => {
  window.sessionStorage.clear();
  window.history.pushState({}, '', '/');
});

it('P1-175 names the project in its heading inside a project and links its pages', async () => {
  appAt('/projects/p-7/history', { projects: { 'p-7': 'octo/demo' } });

  expect(await projectGroup().findByText('Project: octo/demo')).not.toBeNull();
  expect(
    projectGroup()
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual(['Start a run', 'Plan setup', 'History', 'Cost', 'Project settings']);
  expect(rememberedProject()).toBe('p-7');
});

it('P1-175 marks the current page with aria-current in the project group and in the main group', async () => {
  appAt('/projects/p-7/history', { projects: { 'p-7': 'octo/demo' } });
  await projectGroup().findByText('Project: octo/demo');

  expect(projectGroup().getByRole('link', { name: 'History' }).getAttribute('aria-current')).toBe(
    'page',
  );
  expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

  await act(() => {
    navigate('/projects');
  });
  const main = within(screen.getByTestId('nav-group-main'));
  expect(main.getByRole('link', { name: 'Projects' }).getAttribute('aria-current')).toBe('page');
  expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
});

it('P1-175 keeps the last opened project in the group on a page outside a project', async () => {
  appAt('/projects/p-7/start', { projects: { 'p-7': 'octo/demo' }, role: 'admin' });
  await projectGroup().findByText('Project: octo/demo');
  const before = groupIds();

  await act(() => {
    navigate('/settings');
  });
  expect(await projectGroup().findByText('Project: octo/demo')).not.toBeNull();
  expect(projectGroup().getByRole('link', { name: 'Cost' }).getAttribute('href')).toBe(
    '/projects/p-7/cost',
  );
  await act(() => {
    navigate('/admin/audit');
  });
  expect(await projectGroup().findByText('Project: octo/demo')).not.toBeNull();

  expect(groupIds()).toEqual(before);
  expect(before).toEqual(['main', 'project', 'admin']);
});

it('P1-175 uses a project kept from an earlier page of the session', async () => {
  rememberProject('p-3');

  appAt('/projects', { projects: { 'p-3': 'octo/kept' } });

  expect(await projectGroup().findByText('Project: octo/kept')).not.toBeNull();
  expect(projectGroup().getByRole('link', { name: 'History' }).getAttribute('href')).toBe(
    '/projects/p-3/history',
  );
});

it('P1-175 offers a line and no link when no project was opened', async () => {
  appAt('/projects');

  expect(await projectGroup().findByText('Open a project to see its pages')).not.toBeNull();
  expect(projectGroup().queryAllByRole('link')).toHaveLength(0);
  expect(groupIds()).toEqual(['main', 'project']);
});

it('P1-175 gives no link to a kept project the user can no longer open', async () => {
  rememberProject('p-gone');

  appAt('/settings', { projects: { 'p-7': 'octo/demo' } });

  expect(await projectGroup().findByText('Open a project to see its pages')).not.toBeNull();
  expect(projectGroup().queryAllByRole('link')).toHaveLength(0);
  expect(rememberedProject()).toBeUndefined();
});

it('P1-175 shows no project link before the kept project is confirmed', async () => {
  rememberProject('p-3');
  appAt('/settings', { projects: { 'p-3': 'octo/kept' } });

  expect(projectGroup().queryAllByRole('link')).toHaveLength(0);
  await projectGroup().findByText('Project: octo/kept');
});

it('P1-175 gives no link to a project of the address that the user cannot open', async () => {
  appAt('/projects/p-other/start', { projects: {} });

  await waitFor(() => {
    expect(projectGroup().queryAllByRole('link')).toHaveLength(0);
  });
  expect(projectGroup().getByText('Open a project to see its pages')).not.toBeNull();
});

it('P1-175 keeps a kept project when the check fails for another reason than 404', async () => {
  rememberProject('p-3');

  appAt('/settings', { otherwise: 500 });

  expect(await projectGroup().findByText('Open a project to see its pages')).not.toBeNull();
  expect(rememberedProject()).toBe('p-3');
});

it.each(['/projects', '/projects/p-7/start', '/settings', '/runs/r-1'])(
  'P1-175 hides the administration group from a user on %s',
  async (path) => {
    appAt(path, { projects: { 'p-7': 'octo/demo' } });
    await screen.findByTestId('nav-group-project');

    expect(screen.queryByText('Administration')).toBeNull();
    expect(groupIds()).toEqual(['main', 'project']);
  },
);

it('P1-175 gives the long project name its full text on hover and for screen readers', async () => {
  const name = `${'o'.repeat(60)}/${'r'.repeat(80)}`;
  appAt('/projects/p-7/start', { projects: { 'p-7': name } });

  const heading = await projectGroup().findByText(`Project: ${name}`);

  expect(heading.getAttribute('title')).toBe(`Project: ${name}`);
  expect(heading.classList.contains('rst-nav__heading')).toBe(true);
});

it('P1-175 moves between the pages without changing the groups', async () => {
  appAt('/projects', { projects: { 'p-7': 'octo/demo' }, role: 'admin' });
  await screen.findByTestId('nav-group-admin');
  const seen: string[][] = [];
  for (const path of ['/projects/p-7/cost', '/admin/users', '/settings']) {
    await act(() => {
      navigate(path);
    });
    seen.push(groupIds());
  }

  expect(seen).toEqual([
    ['main', 'project', 'admin'],
    ['main', 'project', 'admin'],
    ['main', 'project', 'admin'],
  ]);
});
