import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { SignOutButton } from '../../../web/src/components/SignOutButton.js';
import { rememberedProject, rememberProject } from '../../../web/src/app/remembered-project.js';
import { empty, failure, renderPage } from './fake-api.js';

// RF-1101: Sign out in the header deletes the session on the server and leaves for the sign-in page.

afterEach(() => {
  window.sessionStorage.clear();
});

it('RF-1101 deletes the session with the CSRF token and goes to the sign-in page', async () => {
  const { calls, assign } = renderPage(<SignOutButton />, { 'DELETE /api/session': empty(204) });

  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

  await waitFor(() => {
    expect(assign).toHaveBeenCalledWith('/sign-in');
  });
  expect(calls).toEqual([
    { method: 'DELETE', path: '/api/session', csrf: 'csrf-0', body: undefined },
  ]);
});

it('RF-1101 stays on the page and says why when the sign-out fails', async () => {
  const { assign } = renderPage(<SignOutButton />, {
    'DELETE /api/session': failure(500, 'RST-2006'),
  });

  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

  expect((await screen.findByRole('alert')).textContent).toContain('RST-2006');
  expect(assign).not.toHaveBeenCalled();
});

it('P1-175 forgets the remembered project when the sign-out worked', async () => {
  rememberProject('p-7');
  const { assign } = renderPage(<SignOutButton />, { 'DELETE /api/session': empty(204) });

  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

  await waitFor(() => {
    expect(assign).toHaveBeenCalledWith('/sign-in');
  });
  expect(rememberedProject()).toBeUndefined();
});

it('P1-175 keeps the remembered project when the sign-out fails and the user stays signed in', async () => {
  rememberProject('p-7');
  renderPage(<SignOutButton />, { 'DELETE /api/session': failure(500, 'RST-2006') });

  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

  await screen.findByRole('alert');
  expect(rememberedProject()).toBe('p-7');
});
