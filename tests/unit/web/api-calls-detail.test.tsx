import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  callsBody,
  callsPath,
  logsBody,
  logsPath,
  runKey,
  transcriptPath,
} from './api-calls-fixtures.js';
import { loaded, renderCalls, rowOf, standard } from './api-calls-helpers.js';
import { failure, json, type Answer } from './fake-api.js';

// RF-1011, RF-408, RF-507, RF-1105 (P1-37): the selected call with its transcript, and the page that
// follows a run while it goes on.

afterEach(() => {
  vi.useRealTimers();
});

const transcript = [
  {
    seq: 1,
    at: '2026-10-11T09:18:11.000Z',
    callId: `${runKey}#1`,
    role: 'system',
    content: 'You read one area.',
  },
  {
    seq: 2,
    at: '2026-10-11T09:18:11.000Z',
    callId: `${runKey}#1`,
    role: 'user',
    content: 'Read <b>Catalog</b>.',
  },
];

describe('the selected call and its transcript', () => {
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
});

describe('the selected call without or with a failing transcript', () => {
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
