import { fireEvent, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { callsBody, callsPath, sampleCalls } from './api-calls-fixtures.js';
import { callsPanel, loaded, renderCalls, rowSeqs, standard } from './api-calls-helpers.js';
import { json } from './fake-api.js';

// RF-1011 (P5-22): the calls page shows the first page of the calls and loads the next on demand;
// the figures of the summary and the count come from the whole log.

const firstPage = callsBody({ total: 5, nextCursor: '3' }, sampleCalls.slice(0, 3));
const lastPage = callsBody({ total: 5 }, sampleCalls.slice(3));

function paged(onSecond?: () => void) {
  return {
    ...standard,
    [`GET ${callsPath}?limit=100`]: json(200, firstPage),
    [`GET ${callsPath}?limit=100&cursor=3`]: () => {
      onSecond?.();
      return json(200, lastPage);
    },
  };
}

describe('the calls page loads the calls in pages', () => {
  it('RF-1011 shows the first page with the total and a button for the next one', async () => {
    renderCalls(paged());
    await loaded();

    expect(rowSeqs()).toEqual(['1', '2', '3']);
    expect(within(callsPanel()).getByText(/3 of 5 attempts/u)).toBeTruthy();
    expect(within(callsPanel()).getByRole('button', { name: /Load more calls/u })).toBeTruthy();
  });

  it('RF-1011 loads the next page when the button is pressed and then the button goes', async () => {
    let asked = 0;
    renderCalls(paged(() => (asked += 1)));
    await loaded();

    fireEvent.click(within(callsPanel()).getByRole('button', { name: /Load more calls/u }));

    await screen.findByText(/^5 attempts$/u);
    expect(rowSeqs()).toEqual(['1', '2', '3', '4', '5']);
    expect(asked).toBe(1);
    expect(within(callsPanel()).queryByRole('button', { name: /Load more calls/u })).toBeNull();
  });

  it('RF-1011 shows no button when the first page holds every call', async () => {
    renderCalls();
    await loaded();

    expect(within(callsPanel()).queryByRole('button', { name: /Load more calls/u })).toBeNull();
  });
});
