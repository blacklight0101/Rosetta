import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { endFactsOf } from '../../../web/src/lib/live-run/end-facts.js';
import { RunFacts } from '../../../web/src/pages/RunFacts.js';
import { ev, startedData, stateAfter } from './live-run-fixtures.js';

// RF-1015 (P8-27, DEC-211): the Areas figure reads like the artboard, "2 partly read", and a run
// that read every area says "all read".

const ended = (unreadAreas: number, endState = 'CapReached') =>
  ev(2, 'run.ended', {
    endState,
    unreadAreas,
    totals: { costMicros: 1, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, calls: 0 },
  });

it('RF-1015 the Areas figure says how many areas were partly read', () => {
  const state = stateAfter(ev(1, 'run.started', startedData), ended(2));

  render(<RunFacts facts={endFactsOf(state)} costMicros={1} state={state} />);

  expect(screen.getByText('Areas').closest('li')?.textContent).toContain('2 partly read');
});

it('RF-1015 the Areas figure says "all read" when no area is left unread', () => {
  const state = stateAfter(ev(1, 'run.started', startedData), ended(0));

  render(<RunFacts facts={endFactsOf(state)} costMicros={1} state={state} />);

  expect(screen.getByText('Areas').closest('li')?.textContent).toContain('all read');
});

// RF-230, RF-231 (P8-93, UX-23): an area is "read" only above the coverage bar. A run that started
// every area but read 16% of each ended Completed, and its Areas figure must say "partly read".

it('RF-230 the Areas figure says partly read for areas started but read below the coverage bar', () => {
  const state = stateAfter(ev(1, 'run.started', startedData), ended(0, 'Completed'));

  render(<RunFacts facts={endFactsOf(state)} costMicros={1} state={state} partlyRead={2} />);

  const detail = screen.getByText('Areas').closest('li')?.textContent ?? '';
  expect(detail).toContain('2 partly read');
  expect(detail).not.toContain('all read');
});

it('RF-230 the Areas figure says "all read" only when every area is above the bar', () => {
  const state = stateAfter(ev(1, 'run.started', startedData), ended(0, 'Completed'));

  render(<RunFacts facts={endFactsOf(state)} costMicros={1} state={state} partlyRead={0} />);

  expect(screen.getByText('Areas').closest('li')?.textContent).toContain('all read');
});

it('RF-230 the Areas figure keeps the areas no reader started when the coverage is not known yet', () => {
  const state = stateAfter(ev(1, 'run.started', startedData), ended(3));

  render(<RunFacts facts={endFactsOf(state)} costMicros={1} state={state} />);

  expect(screen.getByText('Areas').closest('li')?.textContent).toContain('3 partly read');
});
