import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { SignOutButton } from '../../../web/src/components/SignOutButton.js';
import { empty, failure, renderPage } from './fake-api.js';

// RF-1101: Sign out in the header deletes the session on the server and leaves for the sign-in page.

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
