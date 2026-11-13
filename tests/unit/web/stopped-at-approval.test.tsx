import { render, screen, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { RunEndBadge } from '../../../web/src/components/RunEndBadge.js';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { headingOf } from '../../../web/src/lib/journey/project-heading.js';
import { runTitleOf } from '../../../web/src/lib/live-run/run-title.js';
import { JourneyStrip } from '../../../web/src/pages/JourneyStrip.js';
import { PlanNext } from '../../../web/src/pages/PlanNext.js';
import { PlanSourcePanel } from '../../../web/src/pages/PlanSourcePanel.js';
import { renderPage } from './fake-api.js';
import { facts, projectId, source } from './journey-fixtures.js';
import { stateAfter } from './live-run-fixtures.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';

// RF-432, RF-006, P9-03, EV-101: a paused run its owner stops with "Stop here" ends `CapReached` for
// its own reason, `StoppedAtApproval`. Every page words it as the owner's stop at the approved
// amount, never as a cap, and Resume does not ask to raise a cap. A run a cap stopped keeps its words.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const WORD = 'Stopped at the approved amount';

it('RF-432 the badge of a run stopped at the approved amount says so, not "Cap reached"', () => {
  render(<RunEndBadge endState="CapReached" endReason="StoppedAtApproval" unreadAreas={0} />);

  expect(screen.getByTestId('status-badge').textContent).toBe(WORD);
});

it('RF-432 the badge of a run a real cap stopped keeps "Cap reached"', () => {
  render(<RunEndBadge endState="CapReached" endReason={null} unreadAreas={0} />);

  expect(screen.getByTestId('status-badge').textContent).toBe('Cap reached');
});

it('RF-432 the title of the run page names the stop at the approved amount', () => {
  const phase = { kind: 'ended', endState: 'CapReached', endReason: 'StoppedAtApproval' } as const;
  const capped = { kind: 'ended', endState: 'CapReached' } as const;

  expect(runTitleOf({ stage: 'understand', phase, state: stateAfter() })).toBe(
    'Understand, stopped at the approved amount',
  );
  expect(runTitleOf({ stage: 'understand', phase: capped, state: stateAfter() })).toBe(
    'Understand, stopped at its cap',
  );
});

it('RF-432 the strip and the title of the project say the stop at the approved amount', () => {
  const stopped = facts({
    source: source({
      endState: 'CapReached',
      endReason: 'StoppedAtApproval',
      errorCode: null,
      supportedClaims: 0,
    }),
  });
  const view = journeyOf(stopped, projectId);
  renderPage(<JourneyStrip view={view} onResumed={() => undefined} />, {});

  const region = screen.getByRole('region', { name: 'Journey from code to package' });
  const step = within(region)
    .getAllByRole('listitem')
    .find((each) => each.querySelector('.rst-road__title')?.textContent === 'Understand');
  expect(step?.querySelector('.rst-road__state')?.textContent).toBe(WORD);
  expect(region.textContent).not.toContain('cap');
  expect(headingOf('OrderDesk', view).status?.text).toBe(
    'Understand stopped at the approved amount',
  );
});

it('RF-006 Resume of a run stopped at the approved amount does not ask to raise a cap', async () => {
  const ended = runRow({
    queueState: 'Ended',
    endState: 'CapReached',
    endReason: 'StoppedAtApproval',
    stage: 'understand',
  });
  renderLive({ [`GET ${runPath}`]: ended });

  await screen.findByRole('button', { name: 'Resume run' });

  const note = screen.getByTestId('resume-note').textContent;
  expect(note).not.toContain('Raise the cap');
  expect(note).toContain('approval');
});

it('RF-006 Resume of a run a real cap stopped still asks to raise the cap first', async () => {
  renderLive({
    [`GET ${runPath}`]: runRow({
      queueState: 'Ended',
      endState: 'CapReached',
      stage: 'understand',
    }),
  });

  await screen.findByRole('button', { name: 'Resume run' });

  expect(screen.getByTestId('resume-note').textContent).toContain('Raise the cap');
});

it('RF-432 the plan note of a run stopped at the approved amount does not blame a cap', () => {
  render(
    <PlanNext
      {...{ runId: 'r-1', projectId: 'p-1', endState: 'CapReached', supportedClaims: 2 }}
      endReason="StoppedAtApproval"
      setUp={false}
    />,
  );

  expect(document.body.textContent).toContain('stopped at the approved amount');
  expect(document.body.textContent).not.toContain('its cap');
});

it('RF-614 the source panel of a run stopped at the approved amount does not say a cap', () => {
  const planSource = {
    ...{ runId: 'r-1', runKey: '20261012-090000-understand', endedAt: null },
    ...{ areas: ['api'], supportedClaims: 2, endState: 'CapReached' as const, newest: true },
    endReason: 'StoppedAtApproval',
  } as const;
  render(<PlanSourcePanel source={planSource} error={undefined} />);

  expect(document.body.textContent).toContain('You stopped this run at the approved amount.');
  expect(document.body.textContent).not.toContain('stopped at a cap');
});
