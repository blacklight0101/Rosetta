import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { project, projectPath, runAnswer, runsPath } from './start-run-fixtures.js';
import { describedText, input, ready, renderStart, start, opened } from './start-run-helpers.js';

// RF-1001, RF-1108, RF-1105, DEC-108: pressing Start on the start page: the request each stage
// sends, the cap saved with the settings, the refusals next to their fields, the URL that is
// resolved first, the queued run with Cancel. The API is the fake of fake-api.tsx.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-1019 a started run opens its live page by itself, with no link to click', async () => {
  renderStart({ [`POST ${runsPath}`]: runAnswer('understand', null) });
  await ready();

  fireEvent.click(start());

  await opened();
  expect(screen.queryByRole('link', { name: 'Open the live run' })).toBeNull();
});

it('RF-1019 a queued run opens its live page too, where its place is said', async () => {
  renderStart({ [`POST ${runsPath}`]: runAnswer('understand', 2, '20261012-100000-understand') });
  await ready();

  fireEvent.click(start());

  await opened();
  expect(window.location.pathname).toBe('/runs/r-1');
});

it('RF-1001 starts an understand run with the chosen areas and no consent when nothing is cloud', async () => {
  const { calls } = renderStart({ [`POST ${runsPath}`]: runAnswer('understand', null) });
  await ready();

  fireEvent.click(start());

  await opened();
  expect(calls.at(-1)?.body).toEqual({
    stage: 'understand',
    areas: ['Catalog', 'Models'],
    cloudConsent: false,
  });
});

it('RF-1001 a refusal of the run shows its code next to Start', async () => {
  renderStart({ [`POST ${runsPath}`]: failure(400, 'RST-2302') });
  await ready();

  fireEvent.click(start());

  const banner = await screen.findByTestId('error-banner');
  expect(banner.textContent).toContain('RST-2302');
  expect(screen.queryByTestId('run-notice')).toBeNull();
});

it('RF-1001 an invalid URL shows its code and reason next to the field and starts nothing', async () => {
  const { calls } = renderStart({
    'POST /api/projects': json(400, {
      code: 'RST-1900',
      message: 'The address is not a public GitHub repository URL.',
      nextStep: 'Use https://github.com/<owner>/<repo>.',
      problems: [
        {
          field: 'url',
          code: 'RST-1900',
          message: 'The address is not a public GitHub repository URL.',
          nextStep: 'Use https://github.com/<owner>/<repo>.',
          reason: 'The address is not on github.com.',
        },
      ],
    }),
  });
  await ready();

  fireEvent.input(input('GitHub repository URL'), {
    target: { value: 'https://example.com/octo/demo' },
  });
  fireEvent.click(start());

  await waitFor(() => {
    expect(document.activeElement).toBe(input('GitHub repository URL'));
  });
  const message = describedText(input('GitHub repository URL'));
  expect(message).toContain('RST-1900');
  expect(message).toContain('The address is not on github.com.');
  expect(calls.some((call) => call.path === runsPath)).toBe(false);
  expect(window.location.pathname).toBe('/');
});

it('RF-1001 Resolve opens the start page of the project for another URL', async () => {
  renderStart({
    'POST /api/projects': json(201, { ...project, id: 'p-2', name: 'acme/shop' }),
  });
  await ready();

  fireEvent.input(input('GitHub repository URL'), {
    target: { value: 'https://github.com/acme/shop' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

  await waitFor(() => {
    expect(window.location.pathname).toBe('/projects/p-2');
  });
});

it("RF-1105 another user's project shows the not-found error and no form", async () => {
  renderStart({ [`GET ${projectPath}`]: failure(404, 'RST-2003') });

  expect((await screen.findByRole('alert')).textContent).toContain('RST-2003');
  expect(screen.queryByRole('button', { name: /^Analyse/u })).toBeNull();
});
