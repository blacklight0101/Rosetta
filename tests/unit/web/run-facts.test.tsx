import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { endFactsOf } from '../../../web/src/lib/live-run/end-facts.js';
import type { AreaReading } from '../../../web/src/lib/understanding/area-read.js';
import { RunFacts } from '../../../web/src/pages/RunFacts.js';
import { ev, startedData, stateAfter } from './live-run-fixtures.js';

// RF-1015 (P8-27, DEC-211): the Areas figure reads like the artboard, "2 partly read", and a run
// that read every area says "all read".
// RF-230, RF-231 (P8-93, UX-23): an area is "read" only above the coverage bar. A run that started
// every area but read 16% of each ended Completed, and its Areas figure must say "partly read"; until
// the coverage is known it does not say "all read".

const ended = (unreadAreas: number, endState = 'CapReached') =>
  ev(2, 'run.ended', {
    endState,
    unreadAreas,
    totals: { costMicros: 1, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, calls: 0 },
  });

const none: AreaReading = { status: 'known', partly: new Map() };
const partly = (...names: string[]): AreaReading => ({
  status: 'known',
  partly: new Map(names.map((name) => [name, 0.16])),
});
const detailOf = (): string => screen.getByText('Areas').closest('li')?.textContent ?? '';

function show(unread: number, reading: AreaReading, endState = 'CapReached'): void {
  const state = stateAfter(ev(1, 'run.started', startedData), ended(unread, endState));
  render(<RunFacts facts={endFactsOf(state)} costMicros={1} state={state} reading={reading} />);
}

it('RF-1015 the Areas figure says how many areas were partly read', () => {
  show(2, none);

  expect(detailOf()).toContain('2 partly read');
});

it('RF-1015 the Areas figure says "all read" when no area is left unread', () => {
  show(0, none);

  expect(detailOf()).toContain('all read');
});

it('RF-230 the Areas figure says partly read for areas started but read below the coverage bar', () => {
  show(0, partly('A', 'B'), 'Completed');

  expect(detailOf()).toContain('2 partly read');
  expect(detailOf()).not.toContain('all read');
});

it('RF-230 the Areas figure keeps the areas no reader started when the coverage is not known', () => {
  show(3, { status: 'unknown' });

  expect(detailOf()).toContain('3 partly read');
});

it('RF-230 the Areas figure says "checking coverage" while the coverage is being read, never "all read"', () => {
  show(0, { status: 'checking' }, 'Completed');

  expect(detailOf()).toContain('checking coverage');
  expect(detailOf()).not.toContain('all read');
});

it('RF-230 the Areas figure says "coverage not known" when the coverage cannot be read, never "all read"', () => {
  show(0, { status: 'unknown' }, 'Completed');

  expect(detailOf()).toContain('coverage not known');
  expect(detailOf()).not.toContain('all read');
});
