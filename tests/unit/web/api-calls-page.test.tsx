import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../../web/src/app/routes.js';
import { ApiCallsPage } from '../../../web/src/pages/ApiCallsPage.js';
import {
  callsBody,
  callsPath,
  logsBody,
  logsPath,
  runKey,
  runUuid,
  sampleCalls,
  transcriptPath,
} from './api-calls-fixtures.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';

// RF-1011, RF-408, RF-507 (P1-37): the "API calls" panel, its summary and the "Logs" panel of
// `/runs/:runId/calls`. Everything on the page comes from the answers of the calls and logs routes.

afterEach(() => {
  vi.useRealTimers();
});

const standard: Readonly<Record<string, Answer>> = {
  [`GET ${callsPath}`]: json(200, callsBody()),
  [`GET ${logsPath}`]: json(200, logsBody()),
};

function renderCalls(answers: Readonly<Record<string, Answer>> = standard) {
  return renderPage(<ApiCallsPage />, answers, undefined, { runId: runUuid });
}

const callsPanel = (): HTMLElement => screen.getByRole('region', { name: 'API calls' });
const rowOf = (seq: number): HTMLElement => {
  const found = within(callsPanel())
    .getAllByTestId('call-row')
    .find((row) => row.getAttribute('data-seq') === String(seq));
  if (found === undefined) throw new Error(`No row for call ${String(seq)}.`);
  return found;
};
const rowSeqs = (): string[] =>
  within(callsPanel())
    .queryAllByTestId('call-row')
    .map((row) => row.getAttribute('data-seq') ?? '');

async function loaded() {
  await screen.findAllByTestId('call-row');
}

describe('the route of the API calls and logs page', () => {
  it('RF-1011 is a signed-in page of the router table', () => {
    const route = routes.find((each) => each.path === '/runs/:runId/calls');

    expect(route).toMatchObject({ access: 'user', chrome: 'shell', title: 'API calls and logs' });
  });
});

describe('the API calls panel', () => {
  it('RF-1011 lists each call with its agent, provider and model, first token, latency, tokens, cost and status', async () => {
    renderCalls();
    await loaded();

    expect(rowSeqs()).toEqual(['1', '2', '3', '4', '5']);
    const first = rowOf(1).textContent;
    expect(first).toContain('Catalog');
    expect(first).toContain('local / qwen3.5:9b');
    expect(first).toContain('1.9 s');
    expect(first).toContain('4.6 s');
    expect(first).toContain('7,022');
    expect(first).toContain('98');
    expect(first).toContain('$0.00');
    expect(first).toContain('Ok');
    expect(rowOf(4).textContent).toContain('$0.0055');
    expect(rowOf(4).textContent).toContain('attempt 2');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('API calls and logs');
    expect(document.body.textContent).toContain(runKey);
  });

  it('RF-1011 highlights errors and retries with their status, HTTP status and error code', async () => {
    renderCalls();
    await loaded();

    expect(rowOf(1).getAttribute('data-problem')).toBe('false');
    expect(rowOf(3).getAttribute('data-problem')).toBe('true');
    expect(rowOf(3).textContent).toContain('429 Retried');
    expect(rowOf(3).textContent).toContain('RST-1504');
    expect(rowOf(5).getAttribute('data-problem')).toBe('true');
    expect(rowOf(5).textContent).toContain('Failed');
    expect(rowOf(5).textContent).toContain('RST-1505');
  });

  it('RF-1011 says when the run has made no call yet', async () => {
    renderCalls({
      ...standard,
      [`GET ${callsPath}`]: json(200, callsBody({ total: 0, summary: [] }, [])),
    });

    expect(await screen.findByText(/No provider calls yet/u)).toBeTruthy();
  });

  it('RF-1011 filters by provider, role, agent and status', async () => {
    renderCalls();
    await loaded();
    const panel = within(callsPanel());

    fireEvent.change(panel.getByLabelText('Provider'), { target: { value: 'cloud' } });
    expect(rowSeqs()).toEqual(['3', '4', '5']);
    fireEvent.change(panel.getByLabelText('Agent'), { target: { value: 'Services' } });
    expect(rowSeqs()).toEqual(['5']);
    fireEvent.change(panel.getByLabelText('Agent'), { target: { value: '' } });
    fireEvent.change(panel.getByLabelText('Status'), { target: { value: 'problems' } });
    expect(rowSeqs()).toEqual(['3', '5']);
    fireEvent.change(panel.getByLabelText('Provider'), { target: { value: '' } });
    fireEvent.change(panel.getByLabelText('Role'), { target: { value: 'reader' } });
    expect(rowSeqs()).toEqual([]);
    expect(panel.getByText('No calls match the filters.')).toBeTruthy();
  });

  it('RF-1011 offers only the providers, roles and agents the calls have', async () => {
    renderCalls();
    await loaded();
    const panel = within(callsPanel());

    const optionsOf = (label: string): string[] =>
      within(panel.getByLabelText(label))
        .getAllByRole('option')
        .map((option) => option.textContent);
    expect(optionsOf('Provider')).toEqual(['All', 'cloud', 'local']);
    expect(optionsOf('Role')).toEqual(['All', 'reader', 'verifier']);
    expect(optionsOf('Agent')).toEqual(['All', 'Catalog', 'Services']);
    expect(optionsOf('Status')).toEqual([
      'All',
      'Errors and retries',
      'Ok',
      'Retried',
      'Failed',
      'Refused by cap',
    ]);
  });

  it('RF-1011 Next error selects each error or retry in turn and starts again after the last', async () => {
    renderCalls();
    await loaded();
    const next = within(callsPanel()).getByRole('button', { name: 'Next error' });

    fireEvent.click(next);
    expect(rowOf(3).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('region', { name: 'Selected call' }).textContent).toContain('Call 3');
    fireEvent.click(next);
    expect(rowOf(5).getAttribute('aria-current')).toBe('true');
    expect(rowOf(3).getAttribute('aria-current')).toBeNull();
    fireEvent.click(next);
    expect(rowOf(3).getAttribute('aria-current')).toBe('true');
  });

  it('RF-1011 disables Next error when every call was answered', async () => {
    renderCalls({
      ...standard,
      [`GET ${callsPath}`]: json(200, callsBody({}, sampleCalls.slice(0, 2))),
    });
    await loaded();

    const next = within(callsPanel()).getByRole('button', { name: 'Next error' });
    expect(next.hasAttribute('disabled')).toBe(true);
  });
});

describe('the summary per provider and role', () => {
  it('RF-1011 shows calls, errors, P50 and P95 latency and time to first token, and tokens per second for Ollama', async () => {
    renderCalls();
    await loaded();

    const summary = screen.getByRole('region', { name: 'Summary per provider and role' });
    const rows = within(summary).getAllByTestId('summary-row');
    expect(rows).toHaveLength(2);
    const cloud = rows[0]?.textContent ?? '';
    expect(cloud).toContain('cloud');
    expect(cloud).toContain('verifier');
    expect(cloud).toContain('1 retried, 1 failed');
    expect(cloud).toContain('2.0 s');
    expect(cloud).toContain('900 ms');
    const local = rows[1]?.textContent ?? '';
    expect(local).toContain('local');
    expect(local).toContain('reader');
    expect(local).toContain('3.9 s');
    expect(local).toContain('4.6 s');
    expect(local).toContain('38 tok/s');
    for (const heading of ['Latency P50', 'Latency P95', 'First token P50', 'First token P95']) {
      expect(within(summary).getByRole('columnheader', { name: heading })).toBeTruthy();
    }
  });
});

describe('the selected call and its transcript', () => {
  const transcript = [
    { seq: 1, at: '2026-10-11T09:18:11.000Z', callId: `${runKey}#1`, role: 'system', content: 'You read one area.' },
    { seq: 2, at: '2026-10-11T09:18:11.000Z', callId: `${runKey}#1`, role: 'user', content: 'Read <b>Catalog</b>.' },
  ];

  it('RF-1011 RF-507 opens the masked transcript of a call as text', async () => {
    const page = renderCalls({
      ...standard,
      [`GET ${transcriptPath(1)}`]: json(200, { entries: transcript }),
    });
    await loaded();

    fireEvent.click(within(rowOf(1)).getByRole('link', { name: 'Transcript of call 1' }));

    const selected = await screen.findByRole('region', { name: 'Selected call' });
    await waitFor(() => {
      expect(within(selected).getAllByTestId('transcript-message')).toHaveLength(2);
    });
    expect(selected.textContent).toContain('Read <b>Catalog</b>.');
    expect(selected.querySelector('b')).toBeNull();
    expect(page.calls.some((call) => call.path === transcriptPath(1))).toBe(true);
    expect(rowOf(1).getAttribute('aria-current')).toBe('true');
  });

  it('RF-1011 links a call without a transcript to nothing', async () => {
    renderCalls();
    await loaded();

    expect(within(rowOf(3)).queryByRole('link')).toBeNull();
    expect(within(rowOf(1)).getByRole('link', { name: 'Transcript of call 1' })).toBeTruthy();
  });

  it("RF-408 shows Ollama's own timings and the finish reason of the selected call", async () => {
    renderCalls({
      ...standard,
      [`GET ${transcriptPath(1)}`]: json(200, { entries: transcript }),
    });
    await loaded();

    fireEvent.click(within(rowOf(1)).getByRole('link', { name: 'Transcript of call 1' }));

    const selected = await screen.findByRole('region', { name: 'Selected call' });
    expect(selected.textContent).toContain('Load');
    expect(selected.textContent).toContain('210 ms');
    expect(selected.textContent).toContain('1.9 s');
    expect(selected.textContent).toContain('3.1 s');
    expect(selected.textContent).toContain('38 tok/s');
    expect(selected.textContent).toContain('stop');
  });

  it('RF-1105 shows the error when the transcript cannot be read', async () => {
    renderCalls({ ...standard, [`GET ${transcriptPath(1)}`]: failure(404, 'RST-2003') });
    await loaded();

    fireEvent.click(within(rowOf(1)).getByRole('link', { name: 'Transcript of call 1' }));

    const selected = await screen.findByRole('region', { name: 'Selected call' });
    await waitFor(() => {
      expect(selected.textContent).toContain('RST-2003');
    });
  });
});

describe('the Logs panel', () => {
  const logsPanel = (): HTMLElement => screen.getByRole('region', { name: 'Logs' });
  const messages = (): string[] =>
    within(logsPanel())
      .queryAllByTestId('log-entry')
      .map((entry) => entry.textContent);

  it('RF-1011 shows info, warn and error entries and hides debug until it is turned on', async () => {
    renderCalls();
    await screen.findAllByTestId('log-entry');

    expect(messages().join('\n')).not.toContain('Turn 1 begins.');
    expect(messages()).toHaveLength(4);

    fireEvent.click(within(logsPanel()).getByRole('button', { name: 'debug' }));

    expect(messages().join('\n')).toContain('Turn 1 begins.');
    expect(messages()).toHaveLength(5);
  });

  it('RF-1011 filters the entries by level', async () => {
    renderCalls();
    await screen.findAllByTestId('log-entry');
    const panel = within(logsPanel());

    expect(panel.getByRole('button', { name: 'error' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(panel.getByRole('button', { name: 'info' }));
    fireEvent.click(panel.getByRole('button', { name: 'warn' }));

    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain('Timeout after 30 s.');
    expect(messages()[0]).toContain('RST-1505');
  });

  it('RF-1011 shows the number of security events and filters the log to them when it is pressed', async () => {
    renderCalls();
    await screen.findAllByTestId('log-entry');
    const counter = within(logsPanel()).getByRole('button', { name: /Security events/u });
    expect(counter.textContent).toContain('1');
    expect(counter.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(counter);

    expect(counter.getAttribute('aria-pressed')).toBe('true');
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain('security');
    fireEvent.click(counter);
    expect(messages()).toHaveLength(4);
  });

  it('RF-1011 RF-507 shows a message as text', async () => {
    renderCalls();
    await screen.findAllByTestId('log-entry');

    expect(logsPanel().textContent).toContain('Masked a <b>password</b> before it was sent.');
    expect(logsPanel().querySelector('b')).toBeNull();
  });

  it('RF-1011 says when the run has logged nothing yet', async () => {
    renderCalls({
      ...standard,
      [`GET ${logsPath}`]: json(
        200,
        logsBody({ total: 0, entries: [], counts: {}, securityEvents: 0 }),
      ),
    });

    expect(await screen.findByText(/No log entries yet/u)).toBeTruthy();
  });
});

describe('following the run live', () => {
  function sequence(running: number): Readonly<Record<string, Answer>> {
    const state = { calls: 0 };
    return {
      ...standard,
      [`GET ${callsPath}`]: () => {
        state.calls += 1;
        const ended = state.calls > running;
        return json(200, callsBody({ runState: ended ? 'Ended' : 'Running' }));
      },
    };
  }

  it('RF-1011 reads the calls and the logs again every few seconds while the run goes on, and stops after it ends', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const page = renderCalls(sequence(2));
    const reads = (path: string): number => page.calls.filter((call) => call.path === path).length;
    await vi.advanceTimersByTimeAsync(0);
    expect(reads(callsPath)).toBe(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(reads(callsPath)).toBe(2);
    expect(reads(logsPath)).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reads(callsPath)).toBe(3);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(reads(callsPath)).toBe(3);
  });

  it('RF-1011 does not poll a run that has ended', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const page = renderCalls({
      [`GET ${callsPath}`]: json(200, callsBody({ runState: 'Ended' })),
      [`GET ${logsPath}`]: json(200, logsBody({ runState: 'Ended' })),
    });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(page.calls.filter((call) => call.path === callsPath)).toHaveLength(1);
    expect(page.calls.filter((call) => call.path === logsPath)).toHaveLength(1);
  });
});

describe('a run the user cannot read', () => {
  it("RF-1105 shows the error of another user's or an unknown run, with no panel", async () => {
    renderCalls({
      [`GET ${callsPath}`]: failure(404, 'RST-2003'),
      [`GET ${logsPath}`]: failure(404, 'RST-2003'),
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('RST-2003');
    });
    expect(screen.queryByRole('region', { name: 'API calls' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Logs' })).toBeNull();
  });
});
