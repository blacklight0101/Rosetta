import { render, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../web/src/api/client.js';
import { App } from '../../../web/src/app/App.js';
import { routes } from '../../../web/src/app/routes.js';
import { userTotals } from './cost-fixtures.js';
import { json } from './fake-api.js';
import {
  agentStarted,
  deepenStarted,
  ev,
  planned,
  runEnded,
  startedData,
  turn,
} from './live-run-fixtures.js';
import { runPath, runRow, runUuid } from './live-run-helpers.js';
import { StreamServer } from './stream-server.js';

// RF-1003, RF-1010, DEC-49, design-system.md section 5 (header totals, cost meter) (P1-95): the
// "This run" meter of the top bar, next to the totals pill. It shows the run's cost against its cap
// while the run is active, warns from 80% and leaves when the run ends. The page reads the run total
// at every model turn; the meter follows that read.

const ana = { id: 'u-1', userName: 'ana', displayName: 'Ana Ruiz', role: 'user', state: 'Active' };

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

/** The whole application on the live page of the run; `cost` answers each read of the run. */
function openRun(cost: (read: number) => number) {
  window.history.pushState({}, '', `/runs/${runUuid}`);
  const stream = new StreamServer();
  vi.stubGlobal('fetch', stream.send);
  let reads = 0;
  const fetchFn: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === '/api/account/totals') return Promise.resolve(json(200, userTotals));
    if (url === runPath) {
      reads += 1;
      return Promise.resolve(runRow({ costMicros: cost(reads) }));
    }
    if (url === '/api/session') return Promise.resolve(json(200, { user: ana, csrfToken: 'c-1' }));
    return Promise.resolve(json(404, { code: 'RST-2003', message: 'No.', nextStep: 'Go back.' }));
  };
  render(<App client={createApiClient({ fetch: fetchFn })} routes={routes} assign={vi.fn()} />);
  return stream;
}

/** P5-07: the run's roles with their provider kinds; the meter reads them from `run.started`. */
function started(stage: string, kind: string) {
  const role = { provider: kind, kind, model: 'm' };
  const roles = { reader: role, verifier: role, planner: role, summariser: role };
  return { ...startedData, stage, roles };
}

const meter = (): HTMLElement => screen.getByRole('meter', { name: 'This run spent against cap' });
it('RF-1003 RF-1010 shows what the run spent against its cap in the top bar, beside the totals', async () => {
  const stream = openRun(() => 412_000);
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', started('understand', 'openai')));

  await waitFor(() => {
    expect(meter().getAttribute('aria-valuenow')).toBe('21');
  });
  expect(meter().getAttribute('aria-valuetext')).toBe('$0.412 of $2.00 (21%)');
  const group = screen.getByTestId('topbar-run-meter');
  expect(group.textContent).toContain('This run');
  expect(group.textContent).toContain('$0.412');
  expect(group.textContent).toContain('$2.00');
  expect(group.textContent).toContain('21%');
  expect(meter().closest('header.rst-header')).not.toBeNull();
  expect(screen.getByTestId('header-totals')).toBeTruthy();
});

it('RF-1003 RF-424 follows the run total that the page reads again at every model turn', async () => {
  const stream = openRun((read) => (read === 1 ? 0 : 1_000_000));
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', started('understand', 'openai')));
  await waitFor(() => {
    expect(meter().getAttribute('aria-valuenow')).toBe('0');
  });

  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(agentStarted(3, 'reader-001', 'Catalog'));
  connection.event(turn(4, 'reader-001', 1, [900, 40]));

  await waitFor(() => {
    expect(meter().getAttribute('aria-valuenow')).toBe('50');
  });
});

it('RF-1003 marks the meter as warning from 80% and in danger from 95%, with words as well as colour', async () => {
  const stream = openRun((read) => (read === 1 ? 1_700_000 : 1_950_000));
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', started('understand', 'openai')));

  await waitFor(() => {
    expect(screen.getByTestId('topbar-run-meter').getAttribute('data-level')).toBe('warn');
  });
  expect(meter().getAttribute('aria-valuetext')).toContain('approaching the cap');
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(turn(3, 'reader-001', 1, [900, 40]));

  await waitFor(() => {
    expect(screen.getByTestId('topbar-run-meter').getAttribute('data-level')).toBe('danger');
  });
  expect(screen.getByTestId('topbar-run-meter').textContent).toContain('At the cap');
});

it('RF-1003 RF-1010 the meter leaves the top bar when the run ends', async () => {
  const stream = openRun(() => 412_000);
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', started('understand', 'openai')));
  await waitFor(() => {
    expect(meter()).toBeTruthy();
  });

  connection.event(runEnded(2, 'Completed'));

  await waitFor(() => {
    expect(screen.queryByTestId('topbar-run-meter')).toBeNull();
  });
  expect(screen.getByTestId('header-totals')).toBeTruthy();
});

it('RF-1003 a run that has not started has no meter in the top bar', async () => {
  const stream = openRun(() => 0);
  const connection = await stream.connection();
  await screen.findByTestId('run-status');

  expect(screen.queryByTestId('topbar-run-meter')).toBeNull();
  connection.event(ev(1, 'run.started', started('understand', 'openai')));
  await screen.findByTestId('topbar-run-meter');
});

// P5-07: the unit follows the run's own roles from the start; the estimate endpoint answers 404 in
// these tests, so nothing waits for it.
it('P5-07 a cloud understand run shows dollars from the start, whatever the estimate does', async () => {
  const stream = openRun(() => 412_000);
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', started('understand', 'openai')));

  const group = await screen.findByTestId('topbar-run-meter');
  expect(group.textContent).toContain('$0.412 of $2.00');
});

it('P5-07 a local understand run shows tokens from the start', async () => {
  const stream = openRun(() => 0);
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', started('understand', 'ollama')));

  const group = await screen.findByTestId('topbar-run-meter');
  expect(group.textContent).toContain('tokens of 10,000 tokens');
  expect(group.textContent).not.toContain('$');
});

it('P5-07 a local deepen run shows tokens, as it reads and judges on local models', async () => {
  const stream = openRun(() => 0);
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', started('understand', 'ollama')));
  connection.event(deepenStarted(2));

  expect((await screen.findByTestId('topbar-run-meter')).textContent).toContain('tokens of');
});

it('P5-07 a local plan run shows tokens', async () => {
  const stream = openRun(() => 0);
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', started('plan', 'ollama')));

  const group = await screen.findByTestId('topbar-run-meter');
  expect(group.textContent).toContain('tokens of');
  expect(group.textContent).not.toContain('$');
});

it('P5-07 a plan run with a cloud planner shows dollars even if the reader is local', async () => {
  const stream = openRun(() => 0);
  const connection = await stream.connection();
  const data = started('plan', 'openai');

  connection.event(
    ev(1, 'run.started', {
      ...data,
      roles: { ...data.roles, reader: { ...data.roles.reader, kind: 'ollama' } },
    }),
  );

  expect((await screen.findByTestId('topbar-run-meter')).textContent).toContain('$');
});
