import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { estimateAnswers, library, own } from './start-run-areas-fixtures.js';
import { estimatePath } from './start-run-fixtures.js';
import { input, ready, renderStart } from './start-run-helpers.js';

// RF-1018 (P1-172): choose the areas of a run quickly. Only own code is listed and selected;
// library code is one collapsed line after the list; Select all, Select none, Own code only and a
// filter narrow the choice.

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
const every = ['Catalog', 'Models', 'jQuery#1', 'Bootstrap#1', 'Scripts#2'];
const list = (): HTMLElement => screen.getByRole('group', { name: 'Areas from the code map' });
const foldedLine = (): HTMLElement => screen.getByTestId('library-areas-line');
const show = (): HTMLElement => within(foldedLine()).getByRole('button', { name: /^Show/u });
const filter = (): HTMLElement => screen.getByLabelText('Filter areas');
const estimateBodies = (calls: readonly { method: string; path: string; body: unknown }[]) =>
  calls.filter((c) => c.method === 'POST' && c.path === estimatePath).map((c) => c.body);

it('RF-1018 the list holds the own areas only, all selected, and library areas are one line after it', async () => {
  renderStart(estimateAnswers(mixed));
  await ready();

  expect(within(list()).getAllByRole('checkbox')).toHaveLength(2);
  expect(input('Catalog').checked).toBe(true);
  expect(input('Models').checked).toBe(true);
  expect(screen.queryByLabelText('jQuery#1')).toBeNull();
  expect(foldedLine().textContent).toContain(
    '3 library areas left out: jQuery#1, Bootstrap#1, Scripts#2',
  );
  const after = list().compareDocumentPosition(foldedLine()) & Node.DOCUMENT_POSITION_FOLLOWING;
  expect(after).toBeTruthy();
  expect(show().getAttribute('aria-expanded')).toBe('false');
});

it('RF-1018 the folded line names a few areas and counts the rest', async () => {
  const many = Array.from({ length: 12 }, (_, index) => library(`Lib${String(index)}#1`));
  renderStart(estimateAnswers([own('Catalog'), ...many]));
  await ready();

  expect(foldedLine().textContent).toContain(
    '12 library areas left out: Lib0#1, Lib1#1, Lib2#1 and 9 more',
  );
});

it('RF-1018 one library area reads in the singular and no library area leaves no line', async () => {
  const { unmount } = renderStart(estimateAnswers([own('Catalog'), library('jQuery#1')]));
  await ready();
  expect(foldedLine().textContent).toContain('1 library area left out: jQuery#1');
  unmount();

  renderStart(estimateAnswers([own('Catalog')]));
  await ready();
  expect(screen.queryByTestId('library-areas-line')).toBeNull();
});

it('RF-1018 Show expands the library areas with their reason and lets the user add one', async () => {
  const { calls } = renderStart(estimateAnswers(mixed));
  await ready();

  fireEvent.click(show());

  expect(show().getAttribute('aria-expanded')).toBe('true');
  const box = input('Bootstrap#1');
  expect(box.checked).toBe(false);
  expect(box.parentElement?.textContent).toContain('Only vendored or minified files');
  expect(within(list()).queryByLabelText('Bootstrap#1')).toBeNull();
  fireEvent.click(box);
  expect(input('Bootstrap#1').checked).toBe(true);
  await waitFor(() => {
    expect(estimateBodies(calls)).toContainEqual({ areas: ['Catalog', 'Models', 'Bootstrap#1'] });
  });
  fireEvent.click(show());
  expect(screen.queryByLabelText('Bootstrap#1')).toBeNull();
});

it('RF-1018 Select all ticks every area, Select none clears, Own code only restores the default', async () => {
  const { calls } = renderStart(estimateAnswers(mixed));
  await ready();
  fireEvent.click(show());

  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  for (const name of every) expect(input(name).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Select none' }));
  for (const name of every) expect(input(name).checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Own code only' }));

  expect(input('Catalog').checked).toBe(true);
  expect(input('Models').checked).toBe(true);
  expect(input('jQuery#1').checked).toBe(false);
  await waitFor(() => {
    expect(estimateBodies(calls).at(-1)).toEqual({ areas: ['Catalog', 'Models'] });
  });
});

it('RF-1018 Select all asks for the plain estimate of every area', async () => {
  const { calls } = renderStart(estimateAnswers(mixed));
  await ready();
  const gets = () => calls.filter((c) => c.method === 'GET' && c.path === estimatePath).length;
  const before = gets();

  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));

  await waitFor(() => {
    expect(gets()).toBe(before + 1);
  });
});

it('RF-1018 the filter narrows the list by name, whatever the case, and keeps the choice', async () => {
  renderStart(estimateAnswers([own('Catalog'), own('Models'), own('CatalogTests')]));
  await ready();

  fireEvent.input(filter(), { target: { value: 'CATA' } });

  expect(within(list()).getAllByRole('checkbox')).toHaveLength(2);
  expect(screen.queryByLabelText('Models')).toBeNull();
  fireEvent.input(filter(), { target: { value: '' } });
  expect(input('Models').checked).toBe(true);
});

it('RF-1018 a filter with no match says so and Clear filter brings the list back', async () => {
  renderStart(estimateAnswers(mixed));
  await ready();

  fireEvent.input(filter(), { target: { value: 'zzz' } });

  expect(screen.getByText(/No area matches/u).textContent).toContain('zzz');
  expect(within(list()).queryAllByRole('checkbox')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
  expect(input('Catalog').checked).toBe(true);
  expect(screen.queryByText(/No area matches/u)).toBeNull();
});

it('RF-1018 the filter also narrows the expanded library areas', async () => {
  renderStart(estimateAnswers(mixed));
  await ready();
  fireEvent.click(show());

  fireEvent.input(filter(), { target: { value: 'boot' } });

  expect(screen.getByLabelText('Bootstrap#1')).toBeTruthy();
  expect(screen.queryByLabelText('jQuery#1')).toBeNull();
});

it('RF-1018 when every area is library code the list says so and Start is disabled', async () => {
  renderStart(estimateAnswers([library('jQuery#1'), library('Bootstrap#1')]));
  await screen.findByTestId('library-areas-line');

  expect(within(list()).queryAllByRole('checkbox')).toHaveLength(0);
  expect(screen.getByText(/No own-code area/u)).toBeTruthy();
  expect(foldedLine().textContent).toContain('2 library areas left out');
  expect(screen.getByRole('button', { name: /^Start run/u }).hasAttribute('disabled')).toBe(true);
});

it('RF-1018 120 areas are all in the list, which sits in a scrolling panel', async () => {
  const many = Array.from({ length: 120 }, (_, i) => own(`Area${String(i).padStart(3, '0')}`));
  renderStart(estimateAnswers(many));
  await ready();

  expect(within(list()).getAllByRole('checkbox')).toHaveLength(120);
  expect(list().closest('.rst-start__area-list')).toBeTruthy();
});

it('RF-1018 a 60-character area name keeps its whole name in a title', async () => {
  const long = `Services/Billing/${'LongFolderName'.repeat(3)}/Payments/Gateway`.slice(0, 60);
  renderStart(estimateAnswers([own(long), own('Models')]));
  await ready();

  expect(long).toHaveLength(60);
  expect(screen.getByText(long, { selector: 'label' }).getAttribute('title')).toBe(long);
});
