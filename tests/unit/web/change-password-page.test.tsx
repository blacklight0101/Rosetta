import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ChangePasswordPage } from '../../../web/src/pages/ChangePasswordPage.js';
import { ana, failure, json, renderPage } from './fake-api.js';

// RF-1103, RF-1102: the change-password page, forced at the first sign-in or opened from the
// settings. The rule checklist follows the typing; the server judges the rules and the current
// password.

const forced = { ...ana, state: 'MustChangePassword' } as const;
const changed = { user: ana, csrfToken: 'csrf-2' };
const goodPassword = ['a', 'fresh', 'phrase', 'here'].join('-');

function type(label: string, value: string): void {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

function ruleStates(): Record<string, string | null> {
  const list = screen.getByRole('list', { name: 'Password rules' });
  return Object.fromEntries(
    Array.from(list.querySelectorAll('li'), (item) => [
      item.textContent.trim(),
      item.getAttribute('data-state'),
    ]),
  );
}

it('RF-1102 greets the first sign-in with the temporary password wording', () => {
  renderPage(<ChangePasswordPage />, {}, forced);

  expect(screen.getByRole('heading', { name: 'Choose your password' })).not.toBeNull();
  expect(screen.getByLabelText('Temporary password')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Save and continue' })).not.toBeNull();
});

it('RF-1103 uses the current-password wording when opened from the settings', () => {
  renderPage(<ChangePasswordPage />, {});

  expect(screen.getByRole('heading', { name: 'Change your password' })).not.toBeNull();
  expect(screen.getByLabelText('Current password')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Change password' })).not.toBeNull();
});

it('RF-1103 shows every rule before typing and updates them while typing', () => {
  renderPage(<ChangePasswordPage />, {});
  expect(Object.values(ruleStates())).toEqual(['pending', 'pending', 'pending']);

  type('New password', 'ten-chars!');
  expect(ruleStates()).toEqual({
    'At least 12 characters (10 so far)': 'fail',
    'Not on the list of common passwords': 'pending',
    'Does not contain your user name': 'pass',
  });

  type('New password', 'x-Ana.Ruiz-x-1');
  expect(ruleStates()).toMatchObject({
    'At least 12 characters': 'pass',
    'Does not contain your user name': 'fail',
  });
});

it('RF-1103 sends the passwords, then leaves for the projects with the new token', async () => {
  const { calls, assign } = renderPage(<ChangePasswordPage />, {
    'POST /api/account/password': json(200, changed),
  });

  type('Current password', 'the-old-phrase');
  type('New password', goodPassword);
  type('Repeat the new password', goodPassword);
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  await waitFor(() => {
    expect(assign).toHaveBeenCalledWith('/projects');
  });
  expect(calls).toEqual([
    {
      method: 'POST',
      path: '/api/account/password',
      csrf: 'csrf-0',
      body: { currentPassword: 'the-old-phrase', newPassword: goodPassword },
    },
  ]);
});

it('RF-1103 does not send a repeat that differs from the new password', () => {
  const { calls } = renderPage(<ChangePasswordPage />, {});

  type('Current password', 'the-old-phrase');
  type('New password', goodPassword);
  type('Repeat the new password', `${goodPassword}x`);
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  expect(calls).toEqual([]);
  expect(screen.getByText('The two passwords do not match.')).not.toBeNull();
});

it('RF-1103 shows a wrong current password next to that field', async () => {
  renderPage(<ChangePasswordPage />, {
    'POST /api/account/password': failure(400, 'RST-2211', [
      { field: 'currentPassword', code: 'RST-2211' },
    ]),
  });

  type('Current password', 'the-old-phrase');
  type('New password', goodPassword);
  type('Repeat the new password', goodPassword);
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  const error = await screen.findByText(/Message of RST-2211/u);
  expect(error.closest('[data-testid="field"]')?.textContent).toContain('Current password');
  expect(screen.getByLabelText('Current password').getAttribute('aria-invalid')).toBe('true');
});

it('RF-1103 marks the common-password rule failed when the server refuses the password', async () => {
  renderPage(<ChangePasswordPage />, {
    'POST /api/account/password': failure(400, 'RST-2203', [
      { field: 'newPassword', code: 'RST-2203' },
    ]),
  });

  type('Current password', 'the-old-phrase');
  type('New password', goodPassword);
  type('Repeat the new password', goodPassword);
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  await waitFor(() => {
    expect(ruleStates()['Not on the list of common passwords']).toBe('fail');
  });
  type('New password', `${goodPassword}2`);
  expect(ruleStates()['Not on the list of common passwords']).toBe('pending');
});

it('RF-1103 shows the same-password refusal on the new password field', async () => {
  renderPage(<ChangePasswordPage />, {
    'POST /api/account/password': failure(400, 'RST-2214', [
      { field: 'newPassword', code: 'RST-2214' },
    ]),
  });

  type('Current password', goodPassword);
  type('New password', goodPassword);
  type('Repeat the new password', goodPassword);
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  expect(await screen.findByText(/Message of RST-2214/u)).not.toBeNull();
  expect(screen.getByLabelText('New password').getAttribute('aria-invalid')).toBe('true');
});

it('RF-1103 shows any other failure in a banner', async () => {
  renderPage(<ChangePasswordPage />, {
    'POST /api/account/password': failure(429, 'RST-2005'),
  });

  type('Current password', 'the-old-phrase');
  type('New password', goodPassword);
  type('Repeat the new password', goodPassword);
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  expect((await screen.findByRole('alert')).textContent).toContain('RST-2005');
});
