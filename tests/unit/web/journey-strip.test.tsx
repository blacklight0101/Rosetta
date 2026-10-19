import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { JourneyStrip } from '../../../web/src/pages/JourneyStrip.js';
import { failure, json, renderPage } from './fake-api.js';
import { facts, planId, projectId, roadSigns, sourceId } from './journey-fixtures.js';

// RF-615, RNF-010: the journey strip draws every step with its state in words and a glyph (never
// colour alone), marks the current step with text, links only the steps that have a page, and offers
// one next action. Each state of the road has its own case.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

function strip(name: string, onResumed: () => void = () => undefined, onAnswer?: () => void) {
  const view = journeyOf(roadSigns[name] ?? facts(), projectId);
  return renderPage(<JourneyStrip view={view} onResumed={onResumed} onAnswer={onAnswer} />, {});
}

const journey = (): HTMLElement =>
  screen.getByRole('region', { name: 'Journey from code to package' });
const item = (title: string): HTMLElement => {
  const found = within(journey())
    .getAllByRole('listitem')
    .find((each) => each.querySelector('.rst-road__title')?.textContent === title);
  if (found === undefined) throw new Error(`No step called ${title}`);
  return found;
};

it('RF-615 lists the seven steps in order', () => {
  strip('estimate');

  const titles = within(journey())
    .getAllByRole('listitem')
    .map((each) => each.querySelector('.rst-road__title')?.textContent);
  expect(titles).toEqual([
    'Scan',
    'Understand',
    'Questions',
    'Brief',
    'Estimate',
    'Plan',
    'Package',
  ]);
});

it.each([
  ['written', 'Package', 'Done'],
  ['capped', 'Understand', 'Failed'],
  ['capped', 'Brief', 'Locked'],
  ['estimate', 'Plan', 'Not yet'],
  ['estimate', 'Estimate', 'Current'],
  ['stale', 'Package', 'Out of date'],
] as const)('RF-615 on the %s road the %s step says %s in words', (road, title, word) => {
  strip(road);

  expect(item(title).querySelector('.rst-road__state')?.textContent).toBe(word);
});

it('RF-615 every step has a glyph that assistive technology skips', () => {
  strip('failed');

  for (const each of within(journey()).getAllByRole('listitem')) {
    expect(each.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  }
});

it('RF-615 the current step is marked by text and aria-current, not by colour alone', () => {
  strip('failed');

  const here = item('Plan');
  expect(here.getAttribute('aria-current')).toBe('step');
  expect(here.textContent).toContain('Current step');
  expect(here.textContent).toContain('Failed');
  expect(here.textContent).toContain('RST-1803');
  const marked = within(journey())
    .getAllByRole('listitem')
    .filter((each) => each.getAttribute('aria-current') === 'step');
  expect(marked).toHaveLength(1);
});

it('RF-615 a locked step gives its reason as text', () => {
  strip('capped');

  expect(item('Brief').textContent).toContain('Needs a completed run: resume it first');
});

it('RF-615 each step shows its cost', () => {
  strip('written');

  expect(item('Understand').textContent).toContain('$0.12');
  expect(item('Plan').textContent).toContain('$0.31');
  expect(item('Scan').textContent).toContain('No model cost');
  expect(journey().textContent).toContain('Total so far $0.43');
});

it('RF-615 only the steps that have a page are links, and a locked step is not one', () => {
  strip('capped');

  const links = within(journey()).getAllByRole('link');
  expect(links.map((each) => each.textContent)).toEqual(['Understand']);
  expect(links[0]?.getAttribute('href')).toBe(`/runs/${sourceId}`);
});

it('RF-615 on a written package every step but the scan links to its page', () => {
  strip('written');

  const links = within(journey()).getAllByRole('link');
  expect(links.map((each) => each.textContent)).toEqual([
    'Understand',
    'Questions',
    'Brief',
    'Estimate',
    'Plan',
    'Package',
  ]);
  expect(links.map((each) => each.getAttribute('href'))).toEqual([
    `/runs/${sourceId}`,
    `/runs/${sourceId}`,
    `/projects/${projectId}/plan-setup?run=${sourceId}`,
    `/projects/${projectId}/plan-setup?run=${sourceId}`,
    `/runs/${planId}`,
    `/runs/${planId}`,
  ]);
});

it('RF-615 the next action of a failed plan is Try the plan again, which opens Plan setup for the run', () => {
  strip('failed');

  fireEvent.click(within(journey()).getByRole('button', { name: 'Try the plan again' }));

  expect(window.location.pathname + window.location.search).toBe(
    `/projects/${projectId}/plan-setup?run=${sourceId}`,
  );
});

it('RF-615 a running plan offers no action', () => {
  strip('planning');

  expect(within(journey()).queryByRole('button')).toBeNull();
});

it('RF-615 Answer questions calls the page when it can show them, else opens the run', () => {
  const onAnswer = vi.fn<() => void>();
  strip('asking', () => undefined, onAnswer);

  fireEvent.click(within(journey()).getByRole('button', { name: 'Answer 2 questions' }));

  expect(onAnswer).toHaveBeenCalledTimes(1);
  expect(window.location.pathname).toBe('/');
});

it('RF-615 Answer questions opens the run page when the page has no questions to show', () => {
  strip('asking');

  fireEvent.click(within(journey()).getByRole('button', { name: 'Answer 2 questions' }));

  expect(window.location.pathname).toBe(`/runs/${sourceId}`);
});

it('RF-006 RF-615 Resume queues the understand run again and tells the page', async () => {
  const onResumed = vi.fn<() => void>();
  const view = journeyOf(roadSigns['capped'] ?? facts(), projectId);
  const resumed = renderPage(<JourneyStrip view={view} onResumed={onResumed} />, {
    [`POST /api/runs/${sourceId}/resume`]: json(202, { id: sourceId }),
  });

  fireEvent.click(within(journey()).getByRole('button', { name: 'Resume' }));

  await waitFor(() => {
    expect(onResumed).toHaveBeenCalledTimes(1);
  });
  expect(resumed.calls.map((call) => `${call.method} ${call.path}`)).toContain(
    `POST /api/runs/${sourceId}/resume`,
  );
});

it('RF-006 RF-615 a refused Resume shows its code and keeps the button', async () => {
  const view = journeyOf(roadSigns['capped'] ?? facts(), projectId);
  renderPage(<JourneyStrip view={view} onResumed={() => undefined} />, {
    [`POST /api/runs/${sourceId}/resume`]: failure(409, 'RST-2307'),
  });

  fireEvent.click(within(journey()).getByRole('button', { name: 'Resume' }));

  await waitFor(() => {
    expect(journey().textContent).toContain('RST-2307');
  });
  expect(within(journey()).getByRole('button', { name: 'Resume' })).toBeTruthy();
});

it('RF-615 a step that is current by its state says so once, not twice', () => {
  strip('estimate');

  const here = item('Estimate');
  expect(here.querySelector('.rst-road__state')?.textContent).toBe('Current');
  expect(here.getAttribute('aria-current')).toBe('step');
  expect(here.querySelector('.rst-road__here')).toBeNull();
});
