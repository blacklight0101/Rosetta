import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { expect, it, vi } from 'vitest';
import { createApiClient } from '../../../web/src/api/client.js';
import { App } from '../../../web/src/app/App.js';
import { AppContext } from '../../../web/src/app/app-context.js';
import { routes } from '../../../web/src/app/routes.js';
import { AdminModelsPage } from '../../../web/src/pages/AdminModelsPage.js';
import { root } from './admin-fixtures.js';
import { json, renderPage } from './fake-api.js';
import { optionTexts, ready, selectOf, withRoles } from './model-list-fixtures.js';

// RF-405, DEC-156: the edges of the model dropdown on the Default models page: who may open it, the
// choice starting again when the provider changes, and the list requests ending with the page.

it('RF-405 a user who opens the Default models page gets the not-found page and no model list is asked', async () => {
  window.history.pushState({}, '', '/admin/models');
  const paths: string[] = [];
  const fetchFn: typeof fetch = (input) => {
    paths.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return Promise.resolve(
      json(200, {
        user: { id: 'u-1', userName: 'ana', displayName: 'Ana', role: 'user', state: 'Active' },
        csrfToken: 'csrf-1',
      }),
    );
  };
  render(<App client={createApiClient({ fetch: fetchFn })} routes={routes} assign={vi.fn()} />);

  expect(await screen.findByRole('heading', { name: 'Page not found' })).not.toBeNull();
  expect(paths.some((path) => path.startsWith('/api/models'))).toBe(false);
  window.history.pushState({}, '', '/');
});

it('RF-405 changing the provider while Other model... is chosen starts the choice again at the new list', async () => {
  renderPage(
    <AdminModelsPage />,
    withRoles({ reader: { provider: 'openai', model: 'gpt-5-nano' } }),
    root,
  );
  await ready();
  fireEvent.change(await waitFor(() => selectOf('Reader model')), {
    target: { value: '__other__' },
  });
  expect(screen.queryByLabelText('Reader other model')).not.toBeNull();

  fireEvent.change(screen.getByLabelText('Reader provider'), { target: { value: 'anthropic' } });

  const select = await waitFor(() => {
    const found = selectOf('Reader model');
    expect(optionTexts(found)).toContain('Claude Opus 5.5 (no price)');
    return found;
  });
  expect(select.value).toBe('');
  expect(screen.queryByLabelText('Reader other model')).toBeNull();
});

it('RF-405 leaving the page cancels the list requests that are still waiting', async () => {
  const signals: AbortSignal[] = [];
  const answers = withRoles({ reader: { provider: 'openai', model: 'gpt-5-nano' } });
  const fetchFn: typeof fetch = (input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (path.startsWith('/api/models/')) {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => undefined);
    }
    const answer = answers[`${init?.method ?? 'GET'} ${path}`];
    return Promise.resolve(answer instanceof Response ? answer.clone() : json(404, {}));
  };
  const client = createApiClient({ fetch: fetchFn });
  const view = render(
    <AppContext.Provider value={{ client, assign: vi.fn() }}>
      <AdminModelsPage />
    </AppContext.Provider>,
  );
  await screen.findByLabelText('Reader provider');
  await waitFor(() => {
    expect(signals).toHaveLength(1);
  });

  view.unmount();

  await waitFor(() => {
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
