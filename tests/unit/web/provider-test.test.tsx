import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { SettingsPage } from '../../../web/src/pages/SettingsPage.js';
import { failure, json, renderPage, type Answer, type RenderedPage } from './fake-api.js';

// RF-407: the Test button of the settings page. It asks the server to check every role with one
// tiny call and shows each role as reachable, or with the error code, what happened and what to do,
// and the cost of the test calls.

const reachable = (role: string, model: string, costMicros = '0') => ({
  role,
  provider: 'ollama',
  model,
  status: 'reachable',
  costMicros,
  currency: 'USD',
});

const answeredBody = {
  roles: [
    reachable('reader', 'gemma4:e4b', '1160'),
    reachable('verifier', 'gemma4:e4b'),
    {
      role: 'planner',
      provider: 'openai',
      model: 'gpt-5-nano',
      status: 'failed',
      costMicros: '0',
      currency: 'USD',
      code: 'RST-2302',
      message: 'No API key is available for this provider.',
      nextStep: 'Save your own key in your settings.',
    },
    reachable('summariser', 'gemma4:e4b'),
  ],
};
const answered = json(200, answeredBody);

const renderSettings = (answers: Readonly<Record<string, Answer>>): RenderedPage =>
  renderPage(<SettingsPage />, {
    'GET /api/account/keys': json(200, { keys: [] }),
    'GET /api/account/daily-cap': json(200, { ownDailyCapMicros: null }),
    ...answers,
  });

const slot = (): HTMLElement => screen.getByTestId('provider-test');

it('RF-407 offers a Test button that has not called anything yet', async () => {
  const { calls } = renderSettings({});

  await screen.findByRole('heading', { name: 'Test providers' });

  expect(within(slot()).getByRole('button', { name: 'Test providers' })).not.toBeNull();
  expect(within(slot()).queryAllByTestId('provider-test-result')).toEqual([]);
  expect(calls.some((call) => call.path.includes('providers/test'))).toBe(false);
});

it('RF-407 shows each role reachable or with its error, and the cost of the test', async () => {
  const { calls } = renderSettings({ 'POST /api/account/providers/test': answered });
  await screen.findByRole('heading', { name: 'Test providers' });

  fireEvent.click(within(slot()).getByRole('button', { name: 'Test providers' }));

  await waitFor(() => {
    expect(within(slot()).getAllByTestId('provider-test-result')).toHaveLength(4);
  });
  const [reader, , planner] = within(slot()).getAllByTestId('provider-test-result');
  expect(reader?.textContent).toContain('Reader');
  expect(reader?.textContent).toContain('ollama');
  expect(reader?.textContent).toContain('gemma4:e4b');
  expect(reader?.textContent).toContain('Reachable');
  expect(reader?.textContent).toContain('$0.00116');
  expect(planner?.textContent).toContain('Failed');
  expect(planner?.textContent).toContain('RST-2302');
  expect(planner?.textContent).toContain('No API key is available for this provider.');
  expect(planner?.textContent).toContain('Save your own key in your settings.');
  expect(calls.at(-1)).toEqual({
    method: 'POST',
    path: '/api/account/providers/test',
    csrf: 'csrf-0',
    body: undefined,
  });
});

it('RF-407 shows a refused request as an error banner with its code', async () => {
  renderSettings({ 'POST /api/account/providers/test': failure(429, 'RST-2005') });
  await screen.findByRole('heading', { name: 'Test providers' });

  fireEvent.click(within(slot()).getByRole('button', { name: 'Test providers' }));

  await waitFor(() => {
    expect(within(slot()).getByTestId('error-banner-code').textContent).toBe('RST-2005');
  });
  expect(within(slot()).queryAllByTestId('provider-test-result')).toEqual([]);
});

it('RF-407 does not send a second test while the first one runs', async () => {
  const { calls } = renderSettings({ 'POST /api/account/providers/test': answered });
  await screen.findByRole('heading', { name: 'Test providers' });
  const button = within(slot()).getByRole('button', { name: 'Test providers' });

  fireEvent.click(button);
  fireEvent.click(button);

  await waitFor(() => {
    expect(within(slot()).getAllByTestId('provider-test-result')).toHaveLength(4);
  });
  expect(calls.filter((call) => call.path === '/api/account/providers/test')).toHaveLength(1);
});

/** An answer that stays open until the test releases it: a cold model that is still loading. */
function slowAnswer(): { readonly response: Response; readonly release: (body: unknown) => void } {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
    },
  });
  const response = new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const release = (body: unknown): void => {
    controller?.enqueue(new TextEncoder().encode(JSON.stringify(body)));
    controller?.close();
  };
  return { response, release };
}

it('RF-407 marks every role as Testing while the answer is awaited, with the button busy', async () => {
  const slow = slowAnswer();
  renderSettings({ 'POST /api/account/providers/test': slow.response });
  await screen.findByRole('heading', { name: 'Test providers' });

  fireEvent.click(within(slot()).getByRole('button', { name: 'Test providers' }));

  const rows = await within(slot()).findAllByTestId('provider-test-pending');
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining('Reader'),
    expect.stringContaining('Verifier'),
    expect.stringContaining('Planner'),
    expect.stringContaining('Summariser'),
  ]);
  for (const row of rows) expect(row.textContent).toContain('Testing');
  const button = within(slot()).getByRole('button', { name: 'Test providers' });
  expect(button.hasAttribute('disabled')).toBe(true);
  expect(button.getAttribute('aria-busy')).toBe('true');

  slow.release(answeredBody);

  await waitFor(() => {
    expect(within(slot()).getAllByTestId('provider-test-result')).toHaveLength(4);
  });
  expect(within(slot()).queryAllByTestId('provider-test-pending')).toEqual([]);
  expect(
    within(slot()).getByRole('button', { name: 'Test providers' }).hasAttribute('disabled'),
  ).toBe(false);
});
