import { fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { JourneyPanel } from '../../../web/src/pages/JourneyPanel.js';
import { JourneyStrip } from '../../../web/src/pages/JourneyStrip.js';
import { json, renderPage } from './fake-api.js';
import { facts, projectId, roadSigns, sourceId } from './journey-fixtures.js';

// RF-1020, P8-100 (UX-05, UX-15, UX-18, UX-20): on every page but the project page the journey strip
// is one compact row (glyph, name, state) that expands to the detail cards on request; on the project
// page it stays expanded and has no button.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

function strip(name: string, alwaysExpanded?: boolean) {
  const view = journeyOf(roadSigns[name] ?? facts(), projectId);
  return renderPage(
    <JourneyStrip view={view} onResumed={() => undefined} alwaysExpanded={alwaysExpanded} />,
    {},
  );
}

const journey = (): HTMLElement =>
  screen.getByRole('region', { name: 'Journey from code to package' });
const toggle = (name: RegExp): HTMLElement => within(journey()).getByRole('button', { name });
const steps = (): HTMLElement[] => within(journey()).getAllByRole('listitem');
/** The parts of a step that only the detail cards show. */
const details = (): HTMLElement[] =>
  Array.from(journey().querySelectorAll<HTMLElement>('.rst-road__body'));

it('RF-1020 P8-100 the strip opens as one compact row of seven steps with a glyph, a name and a state each', () => {
  strip('written');

  const titles = steps().map((each) => each.querySelector('.rst-road__title')?.textContent);
  expect(titles).toEqual([
    'Scan',
    'Understand',
    'Questions',
    'Brief',
    'Estimate',
    'Plan',
    'Package',
  ]);
  for (const each of steps()) {
    expect(each.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(each.querySelector('.rst-road__state')?.textContent).toBeTruthy();
  }
  expect(journey().classList.contains('rst-road--compact')).toBe(true);
});

it('RF-1020 P8-100 the compact row shows no reason, cost or link of a step', () => {
  strip('written');

  expect(details()).toHaveLength(7);
  for (const each of details()) expect(each.hidden).toBe(true);
  expect(within(journey().querySelector('ol') ?? journey()).queryAllByRole('link')).toHaveLength(6);
});

it('RF-1020 P8-100 the current step keeps its mark and the next action, the total and the links stay under the row', () => {
  strip('failed');

  const here = steps().filter((each) => each.getAttribute('aria-current') === 'step');
  expect(here).toHaveLength(1);
  expect(here[0]?.textContent).toContain('Current step');
  expect(journey().textContent).toContain('Total so far');
  expect(within(journey()).getByRole('link', { name: 'Past runs' })).toBeTruthy();
  expect(within(journey()).getByRole('link', { name: 'Settings for this project' })).toBeTruthy();
});

it('RF-1020 P8-100 Show step details opens the detail cards and Hide step details returns to the row', () => {
  strip('written');
  const button = toggle(/Show step details/u);
  expect(button.getAttribute('aria-expanded')).toBe('false');

  fireEvent.click(button);

  const hide = toggle(/Hide step details/u);
  expect(hide.getAttribute('aria-expanded')).toBe('true');
  for (const each of details()) expect(each.hidden).toBe(false);
  expect(within(journey()).getByText('No model cost')).toBeTruthy();
  expect(journey().classList.contains('rst-road--compact')).toBe(false);

  fireEvent.click(hide);

  expect(toggle(/Show step details/u).getAttribute('aria-expanded')).toBe('false');
  for (const each of details()) expect(each.hidden).toBe(true);
});

it('RF-1020 P8-100 the toggle is a native button that the keyboard reaches and controls the list it opens', () => {
  strip('estimate');

  const button = toggle(/Show step details/u);
  expect(button.tagName).toBe('BUTTON');
  expect(button.getAttribute('type')).toBe('button');
  const controlled = button.getAttribute('aria-controls');
  expect(controlled).toBeTruthy();
  expect(journey().querySelector(`ol#${String(controlled)}`)).not.toBeNull();
});

it('RF-1020 P8-100 the project page strip is expanded, shows the detail cards and has no toggle', () => {
  strip('written', true);

  expect(within(journey()).queryByRole('button', { name: /step details/u })).toBeNull();
  for (const each of details()) expect(each.hidden).toBe(false);
  expect(within(journey()).getByText('No model cost')).toBeTruthy();
  expect(journey().classList.contains('rst-road--compact')).toBe(false);
});

it('RF-1020 P8-100 the panel of a run page draws the compact row and the panel of the project page the expanded strip', async () => {
  const path = `GET /api/projects/${projectId}/journey?run=${sourceId}`;
  renderPage(<JourneyPanel projectId={projectId} runId={sourceId} refresh="a" />, {
    [path]: json(200, roadSigns['estimate']),
  });
  await screen.findByRole('region', { name: 'Journey from code to package' });
  expect(toggle(/Show step details/u)).toBeTruthy();
});

it('RF-1020 P8-100 the panel of the project page draws the strip expanded', async () => {
  renderPage(<JourneyPanel projectId={projectId} runId={undefined} refresh="a" alwaysExpanded />, {
    [`GET /api/projects/${projectId}/journey`]: json(200, roadSigns['estimate']),
  });
  await screen.findByRole('region', { name: 'Journey from code to package' });
  expect(within(journey()).queryByRole('button', { name: /step details/u })).toBeNull();
});
