import { render, screen, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import type { RunRow } from '../../../web/src/api/run-schemas.js';
import { RunEndBadge } from '../../../web/src/components/RunEndBadge.js';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { headingOf } from '../../../web/src/lib/journey/project-heading.js';
import { phaseOf } from '../../../web/src/lib/live-run/run-phase.js';
import { runTitleOf } from '../../../web/src/lib/live-run/run-title.js';
import { JourneyStrip } from '../../../web/src/pages/JourneyStrip.js';
import { renderPage } from './fake-api.js';
import { facts, planRun, projectId, source } from './journey-fixtures.js';
import { ev, runInterrupted, startedData, stateAfter } from './live-run-fixtures.js';

// RF-1008, RF-1015, RF-1020, P8-111, DEC-217: a run that ended `Interrupted` reads by why it ended:
// "Stopped by you" only for a Stop (and for a run with no recorded reason), "Stopped by a restart"
// after a restart of the server, "Cancelled while queued" for a cancel before it started.

const wordsOf = [
  ['UserStop', 'Stopped by you'],
  [null, 'Stopped by you'],
  [undefined, 'Stopped by you'],
  ['Restart', 'Stopped by a restart'],
  ['QueueCancel', 'Cancelled while queued'],
] as const;

it.each(wordsOf)(
  'RF-1008 the badge of an Interrupted run with reason %s reads %s',
  (reason, word) => {
    render(<RunEndBadge endState="Interrupted" endReason={reason} />);

    const badge = screen.getByTestId('status-badge');
    expect(badge.textContent).toBe(word);
    expect(badge.querySelector('svg')).not.toBeNull();
  },
);

it('RF-1008 a reason never changes the word of a run that did not end Interrupted', () => {
  render(<RunEndBadge endState="Failed" endReason="Restart" />);

  expect(screen.getByTestId('status-badge').textContent).toBe('Failed');
});

it.each([
  ['UserStop', 'Understand, stopped by you'],
  ['Restart', 'Understand, stopped by a restart'],
  ['QueueCancel', 'Understand, cancelled while queued'],
] as const)('RF-1015 the title of a run page with reason %s is %s', (endReason, title) => {
  const phase = { kind: 'ended', endState: 'Interrupted', endReason } as const;

  expect(runTitleOf({ stage: 'understand', phase, state: stateAfter() })).toBe(title);
});

const row = (endReason: RunRow['endReason']): RunRow => ({
  id: '2f0c4b1e-0000-4000-8000-000000000001',
  projectId: 'p-1',
  runId: '20261012-100000-understand',
  stage: 'understand',
  queueState: 'Ended',
  endState: 'Interrupted',
  endReason,
  position: null,
  queuedAt: '2026-10-12T09:59:00.000Z',
  startedAt: null,
  endedAt: null,
  commitSha: null,
  totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  reportBuilt: false,
  failedAreas: 0,
  unreadAreas: 0,
});

it('RF-1015 the live page takes the reason from run.ended, and from the row after a reload', () => {
  const live = stateAfter(ev(1, 'run.started', startedData), runInterrupted(2, 'Restart'));

  expect(phaseOf(row(null), live)).toMatchObject({ kind: 'ended', endReason: 'Restart' });
  expect(phaseOf(row('QueueCancel'), stateAfter())).toMatchObject({
    kind: 'ended',
    endReason: 'QueueCancel',
  });
});

const stopped = (endReason: 'Restart' | 'QueueCancel' | 'UserStop' | null) =>
  facts({ source: source({ endState: 'Interrupted', endReason, supportedClaims: 0 }) });

it.each([
  ['Restart', 'Stopped by a restart', 'Understand stopped by a restart'],
  ['QueueCancel', 'Cancelled while queued', 'Understand cancelled while queued'],
  ['UserStop', 'Stopped by you', 'Understand stopped by you'],
  [null, 'Stopped by you', 'Understand stopped by you'],
] as const)(
  'RF-1020 the strip and the title of a run with reason %s read %s',
  (reason, word, title) => {
    const view = journeyOf(stopped(reason), projectId);
    renderPage(<JourneyStrip view={view} onResumed={() => undefined} />, {});

    const region = screen.getByRole('region', { name: 'Journey from code to package' });
    const step = within(region)
      .getAllByRole('listitem')
      .find((each) => each.querySelector('.rst-road__title')?.textContent === 'Understand');
    expect(step?.querySelector('.rst-road__state')?.textContent).toBe(word);
    expect(step?.textContent).not.toContain('Failed');
    expect(region.textContent).toContain('Resume this run');
    expect(headingOf('OrderDesk', view).status?.text).toBe(title);
  },
);

it.each([
  ['Restart', 'Plan stopped by a restart'],
  ['QueueCancel', 'Plan cancelled while queued'],
] as const)('RF-1020 the title of a plan run with reason %s is %s', (endReason, title) => {
  const view = journeyOf(
    facts({ plan: planRun({ endState: 'Interrupted', endReason }) }),
    projectId,
  );

  expect(headingOf('OrderDesk', view).status?.text).toBe(title);
});
