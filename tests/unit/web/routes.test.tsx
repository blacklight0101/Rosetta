import { describe, expect, it } from 'vitest';
import { buildNavigation } from '../../../web/src/app/navigation';
import { matchRoute } from '../../../web/src/app/route-match';
import type { RouteDefinition } from '../../../web/src/app/route-types';
import { routes } from '../../../web/src/app/routes';

// P1-12: the router table of web/src/app/routes.ts, its matcher and the navigation built from it.

const page = () => null;
const table: readonly RouteDefinition[] = [
  { path: '/', title: 'Rosetta', access: 'public', chrome: 'bare', component: page },
  {
    path: '/projects',
    title: 'Projects',
    access: 'user',
    chrome: 'shell',
    component: page,
    nav: { group: 'main', label: 'Projects', order: 1 },
  },
  {
    path: '/settings',
    title: 'Settings and keys',
    access: 'user',
    chrome: 'shell',
    component: page,
    nav: { group: 'main', label: 'Settings and keys', order: 2 },
  },
  {
    path: '/projects/:projectId/runs/new',
    title: 'Start a run',
    access: 'user',
    chrome: 'shell',
    component: page,
    nav: { group: 'project', label: 'Start a run', order: 1 },
  },
  {
    path: '/admin/users',
    title: 'Users and caps',
    access: 'admin',
    chrome: 'shell',
    component: page,
    nav: { group: 'admin', label: 'Users and caps', order: 1 },
  },
];

describe('RNF-010 router', () => {
  it('RNF-010 matches a literal path and a path with a parameter', () => {
    expect(matchRoute('/projects', table)?.route.title).toBe('Projects');
    const match = matchRoute('/projects/p-1/runs/new', table);
    expect(match?.route.title).toBe('Start a run');
    expect(match?.params).toEqual({ projectId: 'p-1' });
  });

  it('RNF-010 ignores a trailing slash, the query string and the hash', () => {
    expect(matchRoute('/projects/?tab=2#top', table)?.route.title).toBe('Projects');
  });

  it('RNF-010 matches nothing for an unknown path or a longer one', () => {
    expect(matchRoute('/nope', table)).toBeUndefined();
    expect(matchRoute('/projects/p-1', table)).toBeUndefined();
  });

  it('RNF-010 decodes a parameter and rejects an empty one', () => {
    expect(matchRoute('/projects/a%20b/runs/new', table)?.params).toEqual({ projectId: 'a b' });
    expect(matchRoute('/projects//runs/new', table)).toBeUndefined();
  });

  it('RNF-010 registers the public home page and no path twice', () => {
    expect(routes.some((route) => route.path === '/' && route.access === 'public')).toBe(true);
    expect(new Set(routes.map((route) => route.path)).size).toBe(routes.length);
  });
});

describe('RNF-010 navigation', () => {
  it('RNF-010 groups the pages of a user in order and marks the current one', () => {
    const groups = buildNavigation({ routes: table, role: 'user', params: {}, path: '/settings' });
    expect(groups.map((group) => group.id)).toEqual(['main']);
    expect(groups[0]?.items).toEqual([
      { path: '/projects', label: 'Projects', current: false },
      { path: '/settings', label: 'Settings and keys', current: true },
    ]);
  });

  it('RF-1105 offers the administration group to an administrator only', () => {
    const asUser = buildNavigation({ routes: table, role: 'user', params: {}, path: '/projects' });
    const asAdmin = buildNavigation({
      routes: table,
      role: 'admin',
      params: {},
      path: '/projects',
    });
    expect(asUser.some((group) => group.id === 'admin')).toBe(false);
    const admin = asAdmin.find((group) => group.id === 'admin');
    expect(admin?.label).toBe('Administration');
    expect(admin?.items.map((item) => item.path)).toEqual(['/admin/users']);
  });

  it('RNF-010 shows the project group only inside a project and fills its parameters', () => {
    const outside = buildNavigation({ routes: table, role: 'user', params: {}, path: '/projects' });
    expect(outside.some((group) => group.id === 'project')).toBe(false);
    const inside = buildNavigation({
      routes: table,
      role: 'user',
      params: { projectId: 'p-1' },
      path: '/projects/p-1/runs/new',
      projectName: 'eShopModernizing',
    });
    const project = inside.find((group) => group.id === 'project');
    expect(project?.label).toBe('Project: eShopModernizing');
    expect(project?.items).toEqual([
      { path: '/projects/p-1/runs/new', label: 'Start a run', current: true },
    ]);
  });
});
