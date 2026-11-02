import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { projectPath, runAnswer, runsPath } from './start-run-fixtures.js';
import { ready, renderStart, start, opened } from './start-run-helpers.js';

// RF-241, RF-1001: the start page offers "Re-run with answers" when the project has answered
// questions that are still Open, and an understand run started with it sends `withAnswers: true`.

const answeredPath = `${projectPath}/answered-questions`;
const label = 'Re-run with answers';

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-241 offers Re-run with answers, with the number of answers, when the project has some', async () => {
  renderStart({ [`GET ${answeredPath}`]: json(200, { count: 2 }) });
  await ready();

  const box = await screen.findByLabelText(new RegExp(label, 'u'));
  expect(box).toBeInstanceOf(HTMLInputElement);
  expect(screen.getByText(/2 answered questions/u)).toBeDefined();
});

it('RF-241 does not offer it when no answered question is Open', async () => {
  renderStart({ [`GET ${answeredPath}`]: json(200, { count: 0 }) });
  await ready();

  expect(screen.queryByLabelText(new RegExp(label, 'u'))).toBeNull();
});

it('RF-241 does not offer it when the count cannot be read', async () => {
  renderStart({ [`GET ${answeredPath}`]: failure(500, 'RST-9000') });
  await ready();

  expect(screen.queryByLabelText(new RegExp(label, 'u'))).toBeNull();
});

it('RF-241 starts the run with withAnswers when the option is ticked', async () => {
  const { calls } = renderStart({
    [`GET ${answeredPath}`]: json(200, { count: 1 }),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();

  fireEvent.click(await screen.findByLabelText(new RegExp(label, 'u')));
  fireEvent.click(start());

  await opened();
  expect(calls.at(-1)?.body).toEqual({
    stage: 'understand',
    areas: ['Catalog', 'Models'],
    cloudConsent: false,
    withAnswers: true,
  });
});

it('RF-241 starts a plain understand run when the option is left unticked', async () => {
  const { calls } = renderStart({
    [`GET ${answeredPath}`]: json(200, { count: 1 }),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();
  await screen.findByLabelText(new RegExp(label, 'u'));

  fireEvent.click(start());

  await waitFor(() => {
    expect(calls.at(-1)?.method).toBe('POST');
  });
  expect(calls.at(-1)?.body).toEqual({
    stage: 'understand',
    areas: ['Catalog', 'Models'],
    cloudConsent: false,
  });
});
