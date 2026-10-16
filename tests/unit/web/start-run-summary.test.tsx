import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { estimateAnswers, library, own } from './start-run-areas-fixtures.js';
import { cloudEstimate, runAnswer, runsPath } from './start-run-fixtures.js';
import { input, ready, renderStart, start } from './start-run-helpers.js';

// RF-1018 (P1-172): the summary bar (areas and files chosen, the estimate, Start with the reason
// it is off) and the one confirmation when library areas are chosen.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const mixed = [
  own('Catalog', 5),
  own('Models', 3),
  library('jQuery#1', 4),
  library('Bootstrap#1', 6),
  library('Scripts#2', 2),
];
const bar = (): HTMLElement => screen.getByRole('region', { name: 'Run summary' });
const show = (): HTMLElement =>
  within(screen.getByTestId('library-areas-line')).getByRole('button', { name: /^Show/u });
const libraryNotice = (): HTMLElement =>
  screen.getByRole('region', { name: 'Library areas chosen' });
const confirmLabel = 'Read the library areas too';

it('RF-1018 the summary bar shows the areas and files chosen, the estimate and Start', async () => {
  renderStart(estimateAnswers(mixed, cloudEstimate));
  await ready();

  expect(bar().textContent).toContain('2 of 5 areas');
  expect(bar().textContent).toContain('8 files');
  expect(bar().textContent).toContain('Likely $0.39');
  expect(within(bar()).getByRole('button', { name: /^Start run/u })).toBe(start());
});

it('RF-1018 the summary counts the files of the areas ticked, library areas included', async () => {
  renderStart(estimateAnswers(mixed));
  await ready();

  fireEvent.click(show());
  fireEvent.click(input('jQuery#1'));
  fireEvent.click(input('Catalog'));

  expect(bar().textContent).toContain('2 of 5 areas');
  expect(bar().textContent).toContain('7 files');
});

it('RF-1018 one area and one file read in the singular', async () => {
  renderStart(estimateAnswers([own('Catalog', 1)]));
  await ready();

  expect(bar().textContent).toContain('1 of 1 area · 1 file');
});

it('RF-1018 Start pressed with nothing selected is disabled and the bar says why', async () => {
  renderStart(estimateAnswers(mixed));
  await ready();

  fireEvent.click(screen.getByRole('button', { name: 'Select none' }));

  expect(start().disabled).toBe(true);
  expect(within(bar()).getByTestId('start-reason').textContent).toBe('Choose at least one area.');
  expect(bar().textContent).toContain('0 of 5 areas');
  expect(bar().textContent).not.toContain('Likely');
});

it('RF-1018 a scan has no areas to sum up: the bar holds Start alone', async () => {
  renderStart(estimateAnswers(mixed));
  await ready();

  fireEvent.click(input('Scan only'));

  expect(bar().textContent).not.toContain('areas');
  expect(within(bar()).getByRole('button', { name: /^Start run/u })).toBe(start());
});

it('RF-1018 choosing library areas shows what they add and Start asks for one confirmation', async () => {
  const { calls } = renderStart({
    ...estimateAnswers(mixed),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();
  expect(screen.queryByRole('region', { name: 'Library areas chosen' })).toBeNull();
  fireEvent.click(show());

  fireEvent.click(input('jQuery#1'));
  fireEvent.click(input('Bootstrap#1'));

  expect(libraryNotice().textContent).toContain('2 library areas');
  expect(libraryNotice().textContent).toContain('100,000 tokens');
  expect(start().disabled).toBe(true);
  expect(start().title).toBe('Confirm the library areas, or choose own code only.');
  fireEvent.click(within(libraryNotice()).getByLabelText(confirmLabel));
  expect(start().disabled).toBe(false);
  fireEvent.click(start());

  await waitFor(() => {
    expect(calls.some((call) => call.method === 'POST' && call.path === runsPath)).toBe(true);
  });
  const post = calls.find((call) => call.method === 'POST' && call.path === runsPath);
  expect(post?.body).toMatchObject({ areas: ['Catalog', 'Models', 'jQuery#1', 'Bootstrap#1'] });
});

it('RF-1018 the confirmation is asked once: it stays given when the library choice changes', async () => {
  renderStart(estimateAnswers(mixed));
  await ready();
  fireEvent.click(show());
  fireEvent.click(input('jQuery#1'));
  fireEvent.click(input(confirmLabel));

  fireEvent.click(input('jQuery#1'));
  fireEvent.click(input('Scripts#2'));

  expect(start().disabled).toBe(false);
  expect(input(confirmLabel).checked).toBe(true);
});

it('RF-1018 own code only needs no confirmation', async () => {
  renderStart(estimateAnswers(mixed));
  await ready();

  expect(start().disabled).toBe(false);
  expect(screen.queryByLabelText(confirmLabel)).toBeNull();
});
