import { fireEvent, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../web/src/app/routes.js';
import { callsBody, callsPath, runKey, sampleCalls } from './api-calls-fixtures.js';
import { callsPanel, loaded, renderCalls, rowOf, rowSeqs, standard } from './api-calls-helpers.js';
import { json } from './fake-api.js';

// RF-1011, RF-408 (P1-37): the API calls panel and its summary of `/runs/:runId/calls`. Everything on
// the page comes from the answers of the calls and logs routes.

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
});

describe('the filters of the API calls panel', () => {
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
});

describe('Next error', () => {
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
