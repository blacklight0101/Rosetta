import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { endFactsOf } from '../../../web/src/lib/live-run/end-facts.js';
import { RunFacts } from '../../../web/src/pages/RunFacts.js';
import { ev, startedData, stateAfter } from './live-run-fixtures.js';

// RF-1015 (P8-27, DEC-211): the Areas figure reads like the artboard, "2 partly read", and a run
// that read every area says "all read".

const ended = (unreadAreas: number) =>
  ev(2, 'run.ended', {
    endState: 'CapReached',
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
