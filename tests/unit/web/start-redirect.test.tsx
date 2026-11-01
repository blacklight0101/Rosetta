import { render } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../web/src/api/client.js';
import { App } from '../../../web/src/app/App.js';
import { routes } from '../../../web/src/app/routes.js';
import { matchRoute } from '../../../web/src/app/route-match.js';

// RF-1022, DEC-204: the old start-page address leads to the project page.

const session = {
  user: { id: 'u-1', userName: 'ana', displayName: 'Ana', role: 'user', state: 'Active' },
  csrfToken: 'csrf-1',
};
const signedIn: typeof fetch = () =>
  Promise.resolve(
    new Response(JSON.stringify(session), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-1022 the project page is a route of its own', () => {
  expect(matchRoute('/projects/p-7', routes)).toMatchObject({
    params: { projectId: 'p-7' },
    route: { access: 'user', chrome: 'shell' },
  });
});

it('RF-1022 the old start-page address is redirected to the project page', async () => {
  window.history.pushState({}, '', '/projects/p-7/start');
  const fetchFn = signedIn;

  render(<App client={createApiClient({ fetch: fetchFn })} routes={routes} assign={vi.fn()} />);

  await vi.waitFor(() => {
    expect(window.location.pathname).toBe('/projects/p-7');
  });
});

it('RF-1022 the redirect replaces the old address in the history', async () => {
  window.history.pushState({}, '', '/projects/p-8');
  window.history.pushState({}, '', '/projects/p-7/start');
  const fetchFn = signedIn;

  render(<App client={createApiClient({ fetch: fetchFn })} routes={routes} assign={vi.fn()} />);

  await vi.waitFor(() => {
    expect(window.location.pathname).toBe('/projects/p-7');
  });
  window.history.back();
  await vi.waitFor(() => {
    expect(window.location.pathname).toBe('/projects/p-8');
  });
});
