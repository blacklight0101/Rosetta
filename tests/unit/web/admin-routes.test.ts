import { expect, it } from 'vitest';
import { buildNavigation } from '../../../web/src/app/navigation.js';
import { matchRoute } from '../../../web/src/app/route-match.js';
import { routes } from '../../../web/src/app/routes.js';

// RF-1102, RF-1109, DEC-106, RF-1105, P1-42: the administration pages are administrator-only rows of
// the router table, listed under the Administration heading of the side navigation.

const paths = ['/admin/users', '/admin/audit', '/admin/models'] as const;

it.each(paths)('RF-1105 %s is a page only an administrator may open', (path) => {
  const match = matchRoute(path, routes);

  expect(match?.route.access).toBe('admin');
  expect(match?.route.chrome).toBe('shell');
});

it('RF-1102 lists the pages under Administration for an administrator, in order', () => {
  const groups = buildNavigation({
    routes,
    role: 'admin',
    path: '/admin/audit',
    project: { status: 'none' },
  });

  const admin = groups.find((group) => group.id === 'admin');
  expect(admin?.label).toBe('Administration');
  expect(admin?.items.map((item) => item.label)).toEqual([
    'Users and caps',
    'Audit',
    'Default models',
    // RF-1012, P1-40: the downloaded snapshots.
    'Snapshots',
  ]);
  expect(admin?.items.find((item) => item.current)?.label).toBe('Audit');
});

it('RF-1105 lists no administration page for a user', () => {
  const groups = buildNavigation({
    routes,
    role: 'user',
    path: '/projects',
    project: { status: 'none' },
  });

  expect(groups.some((group) => group.id === 'admin')).toBe(false);
});
