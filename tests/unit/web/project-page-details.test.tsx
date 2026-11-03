import { fireEvent, render, screen, within } from '@testing-library/preact';
import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import type { RunEstimate } from '../../../web/src/api/estimate-schemas.js';
import { estimateLinesOf } from '../../../web/src/lib/journey-approval.js';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { startGate } from '../../../web/src/pages/start-gate.js';
import { JourneyStrip } from '../../../web/src/pages/JourneyStrip.js';
import { ServerKeyNote } from '../../../web/src/pages/ServerKeyNote.js';
import { renderPage } from './fake-api.js';
import { facts, projectId, roadSigns, source } from './journey-fixtures.js';
import { cloudEstimate } from './start-run-fixtures.js';

// RF-1021, RF-1022, P8-26: the estimate as three short lines, the labelled re-run choice in the
// Questions step, names that wrap only at separators, the bar that reserves its height and the
// message that says where its control is.

const css = (name: string): Promise<string> => readFile(`web/src/styles/${name}`, 'utf8');

const journey = {
  basis: 'history',
  deepenRounds: 1,
  ceilingApplied: false,
  likely: { tokens: 1_000_000, costMicros: '400000' },
  worstCase: { tokens: 4_000_000, costMicros: '2000000' },
  approvable: { tokens: 4_000_000, costMicros: '1200000' },
};
const base = { ...cloudEstimate, journey } as unknown as RunEstimate;
const above = {
  ...base,
  journey: { ...journey, likely: { tokens: 5_000_000, costMicros: '1400000' } },
} as unknown as RunEstimate;

it('RF-1022 the journey figures are three short lines: likely, approved and what stops it', () => {
  expect(estimateLinesOf(base)).toEqual({
    likely: '$0.40',
    approved: '$1.20',
    stops: 'the run pauses and asks before it goes past the approved amount',
  });
});

it('RF-1022 RF-434 DEC-210 a likely figure above the approvable one is shown with the approvable figure', () => {
  const lines = estimateLinesOf(above);

  expect(lines?.likely).toBe('$1.20 (likely above what can be approved (likely $1.40))');
  expect(lines?.stops).toBe('the run will pause and ask at the approved amount');
});

it('RF-1022 the estimate draws the three lines and collapses the explanation', () => {
  render(<ServerKeyNote estimate={base} />);

  const total = screen.getByTestId('journey-total');
  expect(within(total).getByText('Likely').closest('div')?.textContent).toContain('$0.40');
  expect(within(total).getByText('Approved').closest('div')?.textContent).toContain('$1.20');
  expect(within(total).getByText('What stops it')).toBeTruthy();
  const more = total.querySelector('details');
  expect(more?.hasAttribute('open')).toBe(false);
  expect(more?.textContent).toContain('replaces the project run cap');
  expect(total.querySelectorAll('dt')).toHaveLength(3);
});

it('RF-241 RF-1021 the choice to re-run with answers is a labelled control in the Questions step', () => {
  const onChange = vi.fn();
  const view = journeyOf(roadSigns['asking'] ?? facts(), projectId, false, { answered: 1 });
  renderPage(
    <JourneyStrip
      view={view}
      onResumed={() => undefined}
      rerun={{ answered: 1, checked: false, onChange }}
    />,
    {},
  );

  const step = screen
    .getAllByRole('listitem')
    .find((each) => each.querySelector('.rst-road__title')?.textContent === 'Questions');
  if (step === undefined) throw new Error('No Questions step');
  fireEvent.click(within(step).getByLabelText(/Re-run with my 1 answered question/u));

  expect(onChange).toHaveBeenCalledWith(true);
  expect(step.textContent).toContain('(1 answered)');
});

it('RF-1021 the strip counts the same questions: no answered question, no control', () => {
  const view = journeyOf(roadSigns['asking'] ?? facts({ source: source() }), projectId);
  renderPage(
    <JourneyStrip
      view={view}
      onResumed={() => undefined}
      rerun={{ answered: 0, checked: false, onChange: () => undefined }}
    />,
    {},
  );

  expect(screen.queryByLabelText(/Re-run with my/u)).toBeNull();
});

it('RF-1022 model and area names never break inside a name', async () => {
  const pages = await css('pages.css');
  const cell = /\.rst-table td\.rst-table__wrap \{[^}]*\}/u.exec(pages)?.[0] ?? '';
  const area = /\.rst-start__area-name \{[^}]*\}/u.exec(pages)?.[0] ?? '';

  for (const rule of [cell, area]) {
    expect(rule).not.toContain('overflow-wrap: anywhere');
    expect(rule).toContain('word-break: keep-all');
  }
});

it('RF-1021 the project page reserves the height of the summary bar so no control is covered', async () => {
  const page = await css('project-page.css');

  expect(page).toMatch(/scroll-padding-block-end:\s*\d/u);
  expect(page).toMatch(/\.rst-start \{[^}]*padding-block-end/u);
});

it('RF-1021 a message that points to a notice says where it is and offers to go to it', () => {
  const ready = startGate({
    stage: 'understand',
    estimate: { status: 'ready', estimate: cloudEstimate as unknown as RunEstimate },
    chosenAreas: 1,
    consentNeeded: 'Anthropic',
    consentGiven: false,
  });
  expect(ready.reason).toBe('Confirm the Anthropic notice just above this bar to start the run');
  expect(ready.notice).toBe('cloud-consent');
});
