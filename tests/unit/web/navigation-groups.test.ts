import { expect, it } from 'vitest';
import { buildNavigation, type ProjectNav } from '../../../web/src/app/navigation.js';
import { routes } from '../../../web/src/app/routes.js';

// P1-175, design-system.md section 3: the side navigation always has the same groups in the same
// order (main, project, administration); only the project group's content changes.

const none: ProjectNav = { status: 'none' };
const open: ProjectNav = { status: 'open', id: 'p-7', name: 'octo/demo' };
const ids = (project: ProjectNav, role: 'admin' | 'user', path: string): string[] =>
  buildNavigation({ routes, role, path, project }).map((group) => group.id);

it.each([
  ['/projects', none],
  ['/projects/p-7/start', open],
  ['/admin/audit', none],
  ['/settings', open],
] as const)('P1-175 an administrator sees main, project, admin in order on %s', (path, project) => {
  expect(ids(project, 'admin', path)).toEqual(['main', 'project', 'admin']);
});

it.each([
  ['/projects', none],
  ['/projects/p-7/start', open],
  ['/settings', open],
] as const)('P1-175 a user never gets the administration group on %s', (path, project) => {
  expect(ids(project, 'user', path)).toEqual(['main', 'project']);
});

it('P1-175 names the open project in the heading and links its pages', () => {
  const groups = buildNavigation({
    routes,
    role: 'user',
    path: '/projects/p-7/history',
    project: open,
  });

  const project = groups.find((group) => group.id === 'project');
  expect(project?.label).toBe('Project: octo/demo');
  expect(project?.note).toBeUndefined();
  expect(project?.items.map((item) => item.path)).toEqual([
    '/projects/p-7/start',
    '/projects/p-7/plan-setup',
    '/projects/p-7/history',
    '/projects/p-7/cost',
    '/projects/p-7/settings',
  ]);
  expect(project?.items.filter((item) => item.current).map((item) => item.label)).toEqual([
    'History',
  ]);
});

it('P1-175 keeps the project links from a page outside a project, none of them current', () => {
  const groups = buildNavigation({ routes, role: 'user', path: '/settings', project: open });

  const project = groups.find((group) => group.id === 'project');
  expect(project?.label).toBe('Project: octo/demo');
  expect(project?.items).toHaveLength(5);
  expect(project?.items.some((item) => item.current)).toBe(false);
  expect(groups.find((group) => group.id === 'main')?.items.find((i) => i.current)?.label).toBe(
    'Settings and keys',
  );
});

it('P1-175 says "Open a project to see its pages" and has no link when none was opened', () => {
  const groups = buildNavigation({ routes, role: 'user', path: '/projects', project: none });

  const project = groups.find((group) => group.id === 'project');
  expect(project?.label).toBe('Project');
  expect(project?.items).toEqual([]);
  expect(project?.note).toBe('Open a project to see its pages');
});

it('P1-175 shows the heading alone, with no link and no note, while the project is checked', () => {
  const groups = buildNavigation({
    routes,
    role: 'user',
    path: '/projects',
    project: { status: 'pending' },
  });

  const project = groups.find((group) => group.id === 'project');
  expect(project).toEqual({ id: 'project', label: 'Project', items: [] });
});

it('P1-175 has the project heading without a name until the name is known', () => {
  const groups = buildNavigation({
    routes,
    role: 'user',
    path: '/projects/p-7/start',
    project: { status: 'open', id: 'p-7' },
  });

  expect(groups.find((group) => group.id === 'project')?.label).toBe('Project');
  expect(groups.find((group) => group.id === 'project')?.items[0]?.path).toBe(
    '/projects/p-7/start',
  );
});

it('P1-175 encodes a project id in every link', () => {
  const groups = buildNavigation({
    routes,
    role: 'user',
    path: '/projects',
    project: { status: 'open', id: 'a b/c' },
  });

  const paths = groups.find((group) => group.id === 'project')?.items.map((i) => i.path);
  expect(paths?.[0]).toBe('/projects/a%20b%2Fc/start');
});
