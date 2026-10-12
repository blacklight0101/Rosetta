import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { SignInPage } from '../../../web/src/pages/SignInPage.js';
import { ana, failure, json, renderPage } from './fake-api.js';

// RF-1100, RF-1101: the sign-in page. The server decides; the page shows its generic answer, which
// is the same for a wrong password and for a locked account, and leaves for the right page.

const answer = { user: ana, csrfToken: 'csrf-1' };

function fill(userName: string, password: string): void {
  fireEvent.input(screen.getByLabelText('User name'), { target: { value: userName } });
  fireEvent.input(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

it('RF-1100 shows the user name and password fields and no error at first', () => {
  renderPage(<SignInPage />, {});

  expect(screen.getByRole('heading', { name: 'Sign in' })).not.toBeNull();
  expect(screen.getByLabelText('User name').getAttribute('autocomplete')).toBe('username');
  expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('RF-1100 sends the credentials and lands on the projects of a signed-in user', async () => {
  const { calls, assign } = renderPage(<SignInPage />, { 'POST /api/session': json(200, answer) });

  fill('ana.ruiz', 'a-fixture-phrase');

  await waitFor(() => {
    expect(assign).toHaveBeenCalledWith('/projects');
  });
  expect(calls).toEqual([
    {
      method: 'POST',
      path: '/api/session',
      csrf: 'csrf-0',
      body: { userName: 'ana.ruiz', password: 'a-fixture-phrase' },
    },
  ]);
});

it('RF-1102 sends an account that must change its password to the change-password page', async () => {
  const forced = { ...ana, state: 'MustChangePassword' };
  const { assign } = renderPage(<SignInPage />, {
    'POST /api/session': json(200, { user: forced, csrfToken: 'csrf-1' }),
  });

  fill('ana.ruiz', 'a-fixture-phrase');

  await waitFor(() => {
    expect(assign).toHaveBeenCalledWith('/account/password');
  });
});

it('RF-1100 shows the generic answer for a wrong password and clears the password', async () => {
  const { assign } = renderPage(<SignInPage />, {
    'POST /api/session': failure(401, 'RST-2201'),
  });

  fill('ana.ruiz', 'a-wrong-phrase');

  const banner = await screen.findByRole('alert');
  expect(banner.textContent).toContain('RST-2201');
  expect(banner.textContent).toContain('Message of RST-2201.');
  expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('');
  expect(screen.getByLabelText<HTMLInputElement>('User name').value).toBe('ana.ruiz');
  expect(assign).not.toHaveBeenCalled();
});

it('RF-1100 shows a locked account the same way as a wrong password', async () => {
  // The server answers a lockout with the generic code (P1-09); the page shows what it is given.
  renderPage(<SignInPage />, { 'POST /api/session': failure(401, 'RST-2201') });
  fill('ana.ruiz', 'a-wrong-phrase');
  const wrong = (await screen.findByRole('alert')).textContent;

  fill('ana.ruiz', 'the-right-phrase');
  await waitFor(() => {
    expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('');
  });

  expect(screen.getByRole('alert').textContent).toBe(wrong);
});

it('RF-1100 explains that the service is invite-only and has no sign-up form', () => {
  renderPage(<SignInPage />, {});

  expect(screen.getByText(/invite-only/u)).not.toBeNull();
  expect(screen.queryByRole('button', { name: /create|register|sign up/iu })).toBeNull();
});
