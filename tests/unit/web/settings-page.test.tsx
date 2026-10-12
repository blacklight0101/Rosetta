import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { SettingsPage } from '../../../web/src/pages/SettingsPage.js';
import { empty, failure, json, renderPage, type Answer, type RenderedPage } from './fake-api.js';

// RF-1104, DEC-64, DEC-107: the settings page. Keys are shown by their last four characters only;
// saving needs a key, replacing and deleting ask first, and the page never holds a saved key.

const fixtureKey = ['fixture', 'key', 'material', 'abcd1234'].join('-');
const newerKey = ['newer', 'fixture', 'material', 'wxyz9876'].join('-');
const saved = { provider: 'openai', last4: '1234', updatedAt: '2026-10-12T09:30:00.000Z' };
const listOf = (...keys: readonly object[]) => json(200, { keys });

/** The page with no own daily cap saved, unless a test answers that route itself. */
const renderSettings = (answers: Readonly<Record<string, Answer>>): RenderedPage =>
  renderPage(<SettingsPage />, {
    'GET /api/account/daily-cap': json(200, { ownDailyCapMicros: null }),
    ...answers,
  });

const row = (name: string): HTMLElement => {
  const heading = screen.getByRole('heading', { name, level: 3 });
  const found = heading.closest('[data-testid="key-row"]');
  if (!(found instanceof HTMLElement)) throw new Error(`No row for ${name}`);
  return found;
};

function enterKey(name: string, value: string): void {
  const input = within(row(name)).getByLabelText('API key');
  fireEvent.input(input, { target: { value } });
}

it('RF-1104 lists a saved key by its last four characters and offers the other providers', async () => {
  renderSettings({ 'GET /api/account/keys': listOf(saved) });

  await screen.findByRole('heading', { name: 'OpenAI', level: 3 });
  expect(row('OpenAI').textContent).toContain('1234');
  expect(row('OpenAI').textContent).toContain('saved 2026-10-12');
  expect(within(row('OpenAI')).getByRole('button', { name: 'Replace' })).not.toBeNull();
  expect(within(row('OpenAI')).getByRole('button', { name: 'Delete' })).not.toBeNull();
  expect(within(row('Anthropic')).getByRole('button', { name: 'Save key' })).not.toBeNull();
  expect(within(row('OpenAI-compatible')).getByLabelText('Base URL')).not.toBeNull();
});

it('RF-1104 saves a key with the CSRF token, shows its last four and keeps nothing else', async () => {
  const { calls } = renderSettings({
    'GET /api/account/keys': listOf(),
    'PUT /api/account/keys/anthropic': json(200, {
      key: {
        provider: 'anthropic',
        last4: fixtureKey.slice(-4),
        updatedAt: '2026-10-12T10:00:00.000Z',
      },
    }),
  });
  await screen.findByRole('heading', { name: 'Anthropic', level: 3 });

  enterKey('Anthropic', fixtureKey);
  fireEvent.click(within(row('Anthropic')).getByRole('button', { name: 'Save key' }));

  await waitFor(() => {
    expect(row('Anthropic').textContent).toContain(fixtureKey.slice(-4));
  });
  expect(calls.at(-1)).toEqual({
    method: 'PUT',
    path: '/api/account/keys/anthropic',
    csrf: 'csrf-0',
    body: { key: fixtureKey },
  });
  expect(document.body.textContent).not.toContain(fixtureKey);
  const values = Array.from(document.querySelectorAll('input'), (input) => input.value);
  expect(values.some((value) => value.includes(fixtureKey))).toBe(false);
});

it('RF-1104 shows a refused key next to its field', async () => {
  renderSettings({
    'GET /api/account/keys': listOf(),
    'PUT /api/account/keys/openai': failure(400, 'RST-2301', [{ field: 'key', code: 'RST-2301' }]),
  });
  await screen.findByRole('heading', { name: 'OpenAI', level: 3 });

  enterKey('OpenAI', 'too short');
  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Save key' }));

  expect(await screen.findByText(/Message of RST-2301/u)).not.toBeNull();
  expect(within(row('OpenAI')).getByLabelText('API key').getAttribute('aria-invalid')).toBe('true');
});

it('RF-1104 sends the base URL of an OpenAI-compatible key and shows its refusal', async () => {
  const { calls } = renderSettings({
    'GET /api/account/keys': listOf(),
    'PUT /api/account/keys/openai-compatible': failure(400, 'RST-2304', [
      { field: 'baseUrl', code: 'RST-2304' },
    ]),
  });
  await screen.findByRole('heading', { name: 'OpenAI-compatible', level: 3 });
  const compatible = within(row('OpenAI-compatible'));

  fireEvent.input(compatible.getByLabelText('Base URL'), {
    target: { value: 'http://192.168.1.20:8000/v1' },
  });
  enterKey('OpenAI-compatible', fixtureKey);
  fireEvent.click(compatible.getByRole('button', { name: 'Save key' }));

  expect(await screen.findByText(/Message of RST-2304/u)).not.toBeNull();
  expect(calls.at(-1)?.body).toEqual({ key: fixtureKey, baseUrl: 'http://192.168.1.20:8000/v1' });
  expect(compatible.getByLabelText('Base URL').getAttribute('aria-invalid')).toBe('true');
});

it('RF-1104 asks for confirmation before it replaces a key', async () => {
  const { calls } = renderSettings({
    'GET /api/account/keys': listOf(saved),
    'PUT /api/account/keys/openai': json(200, {
      key: { provider: 'openai', last4: '9876', updatedAt: '2026-10-12T11:00:00.000Z' },
    }),
  });
  await screen.findByRole('heading', { name: 'OpenAI', level: 3 });

  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Replace' }));
  expect(row('OpenAI').textContent).toContain('The saved key ending 1234 is removed');
  expect(calls.filter((call) => call.method === 'PUT')).toEqual([]);

  enterKey('OpenAI', newerKey);
  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Replace key' }));

  await waitFor(() => {
    expect(row('OpenAI').textContent).toContain('9876');
  });
  expect(document.body.textContent).not.toContain(newerKey);
  expect(row('OpenAI').textContent).not.toContain('1234');
});

it('RF-1104 cancels a replacement and keeps the saved key', async () => {
  const { calls } = renderSettings({ 'GET /api/account/keys': listOf(saved) });
  await screen.findByRole('heading', { name: 'OpenAI', level: 3 });

  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Replace' }));
  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Cancel' }));

  expect(row('OpenAI').textContent).toContain('1234');
  expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
});

it('RF-1104 asks for confirmation before it deletes a key, then removes it', async () => {
  const { calls } = renderSettings({
    'GET /api/account/keys': listOf(saved),
    'DELETE /api/account/keys/openai': empty(204),
  });
  await screen.findByRole('heading', { name: 'OpenAI', level: 3 });

  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Delete' }));
  expect(row('OpenAI').textContent).toContain('Delete the key ending 1234?');
  expect(calls.filter((call) => call.method === 'DELETE')).toEqual([]);

  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Delete key' }));

  await waitFor(() => {
    expect(within(row('OpenAI')).getByRole('button', { name: 'Save key' })).not.toBeNull();
  });
  expect(calls.at(-1)).toEqual({
    method: 'DELETE',
    path: '/api/account/keys/openai',
    csrf: 'csrf-0',
    body: undefined,
  });
});

it('RF-1104 keeps the key and shows the error when a delete fails', async () => {
  renderSettings({
    'GET /api/account/keys': listOf(saved),
    'DELETE /api/account/keys/openai': failure(404, 'RST-2003'),
  });
  await screen.findByRole('heading', { name: 'OpenAI', level: 3 });

  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Delete' }));
  fireEvent.click(within(row('OpenAI')).getByRole('button', { name: 'Delete key' }));

  expect((await within(row('OpenAI')).findByRole('alert')).textContent).toContain('RST-2003');
  expect(row('OpenAI').textContent).toContain('1234');
});

it('RF-1104 shows the error when the keys cannot be listed', async () => {
  renderSettings({ 'GET /api/account/keys': failure(500, 'RST-2006') });

  expect((await screen.findByRole('alert')).textContent).toContain('RST-2006');
});

it('RF-1103 links to the change-password page', async () => {
  renderSettings({ 'GET /api/account/keys': listOf() });

  const link = await screen.findByRole('link', { name: 'Change password' });
  expect(link.getAttribute('href')).toBe('/account/password');
});
