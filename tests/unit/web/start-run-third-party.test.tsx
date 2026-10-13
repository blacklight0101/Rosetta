import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { estimatePath, localEstimate, runAnswer, runsPath } from './start-run-fixtures.js';
import { input, ready, renderStart, start } from './start-run-helpers.js';

// RF-1001, RF-200 (P1-147): the areas that hold only vendored or minified files are marked
// "third-party" on the start page and start unticked, so a default run does not read them. They stay
// in the list and can be ticked.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const withVendored = {
  ...localEstimate,
  areas: [
    { name: 'Catalog', estimatedTokens: 12_000, thirdParty: false },
    { name: 'Models', estimatedTokens: 8000, thirdParty: false },
    { name: 'Scripts#1', estimatedTokens: 900_000, thirdParty: true },
  ],
};
const ownAreas = {
  ...withVendored,
  areas: withVendored.areas.filter((area) => !area.thirdParty),
};
const defaultPath = `${estimatePath}?areas=Catalog&areas=Models`;
const answers = {
  [`GET ${estimatePath}`]: json(200, withVendored),
  [`GET ${defaultPath}`]: json(200, ownAreas),
};

it('RF-1001 an area of third-party files starts unticked and is marked, the others are ticked', async () => {
  renderStart(answers);
  await ready();

  await waitFor(() => {
    expect(input('Scripts#1').checked).toBe(false);
  });
  expect(input('Catalog').checked).toBe(true);
  expect(input('Models').checked).toBe(true);
  const row = input('Scripts#1').parentElement;
  expect(row?.textContent).toContain('third-party');
  expect(
    within(screen.getByRole('group', { name: 'Areas from the code map' })).getAllByText(
      'third-party',
    ),
  ).toHaveLength(1);
});

it('RF-1001 the estimate of the default selection leaves the third-party areas out', async () => {
  const { calls } = renderStart(answers);
  await ready();

  await waitFor(() => {
    expect(calls.map((call) => call.path)).toContain(defaultPath);
  });
});

it('RF-1001 starting the run sends the own areas only', async () => {
  const { calls } = renderStart({
    ...answers,
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();
  await waitFor(() => {
    expect(calls.map((call) => call.path)).toContain(defaultPath);
  });

  fireEvent.click(start());

  await waitFor(() => {
    expect(calls.some((call) => call.method === 'POST' && call.path === runsPath)).toBe(true);
  });
  const post = calls.find((call) => call.method === 'POST' && call.path === runsPath);
  expect(post?.body).toMatchObject({ stage: 'understand', areas: ['Catalog', 'Models'] });
});

it('RF-1001 ticking a third-party area adds it to the selection', async () => {
  const { calls } = renderStart(answers);
  await ready();
  await waitFor(() => {
    expect(input('Scripts#1').checked).toBe(false);
  });

  fireEvent.click(input('Scripts#1'));

  expect(input('Scripts#1').checked).toBe(true);
  await waitFor(() => {
    expect(calls.map((call) => call.path)).toContain(estimatePath);
  });
  expect(input('Catalog').checked).toBe(true);
});

it('RNF-010 every area keeps its full name in a title, so a wrapped path can be read whole', async () => {
  renderStart(answers);
  await ready();

  const label = screen.getByText('Scripts#1', { selector: 'label' });

  expect(label.getAttribute('title')).toBe('Scripts#1');
  expect(label.className).toContain('rst-start__area-name');
});
