import { screen, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { json } from './fake-api.js';
import { ev, runEnded, startedData } from './live-run-fixtures.js';
import { renderLive } from './live-run-helpers.js';

// RF-1108, RF-007, RNF-008 (P1-147): a run that ended with an error code says what the code means
// and what to do, in the words of the error catalogue, for every code the server knows; the page
// keeps its links to where the user can fix it.

afterEach(() => {
  vi.unstubAllGlobals();
});

const catalogue = (code: string, message: string, nextStep: string): Record<string, Response> => ({
  [`GET /api/errors/${code}`]: json(200, { code, message, nextStep }),
});

async function endedWith(code: string, answers: Record<string, Response>) {
  const { stream } = renderLive(answers);
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(runEnded(2, 'Failed', code));
  return screen.findByTestId('run-failure');
}

it('RF-1108 RST-1901 shows the catalogue message and next step on the live run page', async () => {
  const answers = catalogue(
    'RST-1901',
    'The branch, tag or commit was not found in this repository.',
    'Check the ref in the address, or leave it out to use the default branch.',
  );

  const failure = await endedWith('RST-1901', answers);

  await vi.waitFor(() => {
    expect(failure.textContent).toContain('The branch, tag or commit was not found');
  });
  expect(failure.textContent).toContain('RST-1901');
  expect(failure.textContent).toContain('leave it out to use the default branch');
  expect(failure.textContent).not.toContain('The run ended with an error');
  expect(within(failure).queryByRole('link')).toBeNull();
});

it('RF-1108 a code the page knows a fix for keeps its link next to the catalogue text', async () => {
  const answers = catalogue('RST-1506', 'A model call failed.', 'Check the provider and retry.');

  const failure = await endedWith('RST-1506', answers);

  await vi.waitFor(() => {
    expect(failure.textContent).toContain('Check the provider and retry.');
  });
  expect(
    within(failure).getByRole('link', { name: 'Settings and keys' }).getAttribute('href'),
  ).toBe('/settings');
});

it('RF-1108 while the catalogue answer is missing the page shows the code and a pointer to the catalogue', async () => {
  const failure = await endedWith('RST-1901', {});

  expect(failure.textContent).toContain('RST-1901');
  await vi.waitFor(() => {
    expect(failure.textContent).toContain('The run ended with an error');
  });
  expect(failure.textContent).toContain('error catalogue');
});

it('RF-401 DEC-155 a plan run that ended with RST-1522 shows that code and its remedies, never RST-1803', async () => {
  const answers = catalogue(
    'RST-1522',
    'The prompt of this role is larger than the context Ollama gives the model.',
    'Choose a model with a larger context, or a cloud model for this role, in the project settings.',
  );

  const failure = await endedWith('RST-1522', answers);

  await vi.waitFor(() => {
    expect(failure.textContent).toContain('larger than the context Ollama gives the model');
  });
  expect(failure.textContent).toContain('RST-1522');
  expect(failure.textContent).toContain('a cloud model for this role');
  expect(failure.textContent).not.toContain('RST-1803');
});
