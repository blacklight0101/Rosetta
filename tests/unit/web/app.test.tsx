import { render, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../../../web/src/app/App.js';
import type { RouteDefinition } from '../../../web/src/app/route-types.js';
import { createApiClient } from '../../../web/src/api/client.js';

// RF-1009, RF-1100, RF-1105: a page that needs a session asks the server who is signed in; the
// server decides, the page only reflects it (another role gets the not-found page, not a 403).

/** The address of a fetch input, which may be a string, a URL or a Request. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

const ana = { id: 'u-1', userName: 'ana', displayName: 'Ana Ruiz', role: 'user', state: 'Active' };
const sessionAnswer = (user: typeof ana) => ({ user, csrfToken: 'csrf-1' });

const routes: readonly RouteDefinition[] = [
  {
    path: '/',
    title: 'Rosetta',
    access: 'public',
    chrome: 'bare',
    component: () => <p>Welcome</p>,
  },
  {
    path: '/projects',
    title: 'Projects',
    access: 'user',
    chrome: 'shell',
    component: () => <h1>Your projects</h1>,
    nav: { group: 'main', label: 'Projects', order: 1 },
  },
  {
    path: '/admin/users',
    title: 'Users and caps',
    access: 'admin',
    chrome: 'shell',
    component: () => <h1>All users</h1>,
    nav: { group: 'admin', label: 'Users and caps', order: 1 },
  },
];

function appAt(path: string, answer: () => Response) {
  window.history.pushState({}, '', path);
  const calls: { url: string; method: string; csrf: string | null }[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({
      url: urlOf(input),
      method: init?.method ?? 'GET',
      csrf: new Headers(init?.headers).get('x-csrf-token'),
    });
    return Promise.resolve(answer());
  };
  const assign = vi.fn();
  const view = render(
    <App client={createApiClient({ fetch: fetchFn })} routes={routes} assign={assign} />,
  );
  return { calls, assign, ...view };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  window.history.pushState({}, '', '/');
  document.title = '';
});

it('RF-1009 renders a public page without asking for a session', () => {
  const { calls } = appAt('/', () => json(200, {}));
  expect(screen.getByText('Welcome')).not.toBeNull();
  expect(calls).toEqual([]);
});

it('RF-1100 shows the shell with the signed-in user once the session answers', async () => {
  const { calls } = appAt('/projects', () => json(200, sessionAnswer(ana)));
  expect(await screen.findByRole('heading', { name: 'Your projects' })).not.toBeNull();
  expect(screen.getByText('Ana Ruiz')).not.toBeNull();
  expect(screen.getByRole('link', { name: 'Projects' }).getAttribute('aria-current')).toBe('page');
  expect(calls).toEqual([{ url: '/api/session', method: 'GET', csrf: null }]);
  expect(document.title).toBe('Projects - Rosetta');
});

it('RF-1100 goes to the sign-in page when there is no session', async () => {
  const { assign } = appAt('/projects', () =>
    json(401, { code: 'RST-2001', message: 'Sign in.', nextStep: 'Sign in again.' }),
  );
  await waitFor(() => {
    expect(assign).toHaveBeenCalledWith('/sign-in');
  });
  expect(screen.queryByRole('heading', { name: 'Your projects' })).toBeNull();
});

it('RNF-008 shows the error banner with the code when the session cannot be read', async () => {
  appAt('/projects', () =>
    json(500, { code: 'RST-2006', message: 'Broke.', nextStep: 'Try again later.' }),
  );
  const banner = await screen.findByRole('alert');
  expect(banner.textContent).toContain('RST-2006');
  expect(banner.textContent).toContain('Try again later.');
});

it('RF-1105 answers the not-found page to a user who opens an administrator page', async () => {
  appAt('/admin/users', () => json(200, sessionAnswer(ana)));
  expect(await screen.findByRole('heading', { name: 'Page not found' })).not.toBeNull();
  expect(screen.queryByText('All users')).toBeNull();
});

it('RF-1105 offers an administrator the administrator pages', async () => {
  appAt('/admin/users', () => json(200, sessionAnswer({ ...ana, role: 'admin' })));
  expect(await screen.findByRole('heading', { name: 'All users' })).not.toBeNull();
  expect(screen.getByText('Administration')).not.toBeNull();
});

it('RNF-010 shows the not-found page for an unknown path', () => {
  appAt('/nowhere', () => json(200, {}));
  expect(screen.getByRole('heading', { name: 'Page not found' })).not.toBeNull();
});
