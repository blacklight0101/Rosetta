import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ChangePasswordPage } from '../../../web/src/pages/ChangePasswordPage.js';
import { SettingsPage } from '../../../web/src/pages/SettingsPage.js';
import { SignInPage } from '../../../web/src/pages/SignInPage.js';
import { empty, failure, json, renderPage } from './fake-api.js';

// RNF-010, design-system.md section 8: a refusal is announced and focus goes to what needs fixing,
// never to the page body. RF-1100, RF-1103, RF-1104.

const goodPassword = ['a', 'fresh', 'phrase', 'here'].join('-');
const aKey = ['fixture', 'key', 'material', 'abcd1234'].join('-');
const saved = { provider: 'openai', last4: '1234', updatedAt: '2026-10-12T09:30:00.000Z' };

function type(label: string, value: string): void {
  fireEvent.input(screen.getByLabelText(label, { exact: true }), { target: { value } });
}

function fillPasswords(current: string): void {
  type('Current password', current);
  type('New password', goodPassword);
  type('Repeat the new password', goodPassword);
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

function describedText(element: HTMLElement): string {
  const ids = (element.getAttribute('aria-describedby') ?? '').split(' ');
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

const row = (name: string): HTMLElement => {
  const found = screen.getByRole('heading', { name, level: 3 }).closest('[data-testid="key-row"]');
  if (!(found instanceof HTMLElement)) throw new Error(`No row for ${name}`);
  return found;
};

it('RNF-010 announces a field refusal and moves focus to the invalid field', async () => {
  renderPage(<ChangePasswordPage />, {
    'POST /api/account/password': failure(400, 'RST-2211', [
      { field: 'currentPassword', code: 'RST-2211' },
    ]),
  });

  fillPasswords('the-old-phrase');

  const field = screen.getByLabelText('Current password', { exact: true });
  await waitFor(() => {
    expect(document.activeElement).toBe(field);
  });
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(describedText(field)).toContain('Message of RST-2211');
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain('Message of RST-2211');
  expect(alert.id).not.toBe('');
});

it('RNF-010 focuses the new password field when the rules refuse it', async () => {
  renderPage(<ChangePasswordPage />, {
    'POST /api/account/password': failure(400, 'RST-2202', [
      { field: 'newPassword', code: 'RST-2202' },
    ]),
  });

  fillPasswords('the-old-phrase');

  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByLabelText('New password', { exact: true }));
  });
});

it('RNF-010 focuses the repeat field every time the repeat differs', async () => {
  renderPage(<ChangePasswordPage />, {});
  type('Current password', 'the-old-phrase');
  type('New password', goodPassword);
  type('Repeat the new password', 'different');

  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  const repeat = screen.getByLabelText('Repeat the new password');
  await waitFor(() => {
    expect(document.activeElement).toBe(repeat);
  });
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  await waitFor(() => {
    expect(document.activeElement).toBe(repeat);
  });
});

it('RNF-010 focuses the banner when a refusal names no field', async () => {
  renderPage(<ChangePasswordPage />, { 'POST /api/account/password': failure(429, 'RST-2005') });

  fillPasswords('the-old-phrase');

  const banner = await screen.findByRole('alert');
  await waitFor(() => {
    expect(document.activeElement).toBe(banner);
  });
});

it('RNF-010 makes the rule checklist a polite live region described from the new password', () => {
  renderPage(<ChangePasswordPage />, {});

  const rules = screen.getByRole('list', { name: 'Password rules' });
  expect(rules.getAttribute('aria-live')).toBe('polite');
  const field = screen.getByLabelText('New password', { exact: true });
  expect(field.getAttribute('aria-describedby')).toContain(rules.id);
  expect(rules.id).not.toBe('');
});

it('RNF-010 focuses the password field after a failed sign-in, with the code after the message', async () => {
  renderPage(<SignInPage />, { 'POST /api/session': failure(401, 'RST-2201') });
  fireEvent.input(screen.getByLabelText('User name'), { target: { value: 'ana.ruiz' } });
  fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'a-wrong-phrase' } });

  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  const banner = await screen.findByRole('alert');
  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByLabelText('Password'));
  });
  expect(banner.textContent).toMatch(/Message of RST-2201..*(RST-2201)/su);
});

it('RNF-010 focuses the invalid field of a refused key and announces the error', async () => {
  renderPage(<SettingsPage />, {
    'GET /api/account/keys': json(200, { keys: [] }),
    'PUT /api/account/keys/openai-compatible': failure(400, 'RST-2304', [
      { field: 'baseUrl', code: 'RST-2304' },
    ]),
  });
  await screen.findByRole('heading', { name: 'OpenAI-compatible', level: 3 });
  const compatible = within(row('OpenAI-compatible'));
  fireEvent.input(compatible.getByLabelText('Base URL'), { target: { value: 'http://10.0.0.1' } });
  fireEvent.input(compatible.getByLabelText('API key'), { target: { value: aKey } });

  fireEvent.click(compatible.getByRole('button', { name: 'Save key' }));

  const url = compatible.getByLabelText('Base URL');
  await waitFor(() => {
    expect(document.activeElement).toBe(url);
  });
  expect(describedText(url)).toContain('Message of RST-2304');
  expect(compatible.getByRole('alert').textContent).toContain('Message of RST-2304');
});

it('RNF-010 moves focus into the delete confirmation and back to Delete on cancel', async () => {
  renderPage(<SettingsPage />, {
    'GET /api/account/keys': json(200, { keys: [saved] }),
    'DELETE /api/account/keys/openai': empty(204),
  });
  await screen.findByRole('heading', { name: 'OpenAI', level: 3 });

  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Delete' }));

  const confirmation = within(row('OpenAI')).getByRole('group', { name: /Delete the key/u });
  await waitFor(() => {
    expect(document.activeElement).toBe(confirmation);
  });
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(document.activeElement).toBe(
      within(row('OpenAI')).getByRole('button', { name: 'Delete' }),
    );
  });
});

it('RNF-010 moves focus to the key field on Replace and back to Replace on cancel', async () => {
  renderPage(<SettingsPage />, { 'GET /api/account/keys': json(200, { keys: [saved] }) });
  await screen.findByRole('heading', { name: 'OpenAI', level: 3 });

  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Replace' }));

  const key = within(row('OpenAI')).getByLabelText('API key');
  await waitFor(() => {
    expect(document.activeElement).toBe(key);
  });
  expect(describedText(key)).toContain('The saved key ending 1234 is removed');
  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(document.activeElement).toBe(
      within(row('OpenAI')).getByRole('button', { name: 'Replace' }),
    );
  });
});

it('RNF-010 keeps focus in the confirmation when a delete fails', async () => {
  renderPage(<SettingsPage />, {
    'GET /api/account/keys': json(200, { keys: [saved] }),
    'DELETE /api/account/keys/openai': failure(404, 'RST-2003'),
  });
  await screen.findByRole('heading', { name: 'OpenAI', level: 3 });
  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Delete' }));

  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Delete key' }));

  const banner = await within(row('OpenAI')).findByRole('alert');
  await waitFor(() => {
    expect(document.activeElement).toBe(banner);
  });
});
