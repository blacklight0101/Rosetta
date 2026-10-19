import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { openEnded, question } from './ended-run-helpers.js';
import { json } from './fake-api.js';
import { facts, projectId, roadSigns, source } from './journey-fixtures.js';
import { ev, runEnded, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runRow, runUuid } from './live-run-helpers.js';

// RF-615, RF-1015: the journey strip sits on the page of an understand run that has ended and on the
// page of a plan run, reads the facts of that run, and reads them again when the run changes state.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const journeyPath = `/api/projects/${projectId}/journey?run=${runUuid}`;
const strip = (): HTMLElement =>
  screen.getByRole('region', { name: 'Journey from code to package' });
const mine = facts({ source: source({ id: runUuid }) });
const stopped = facts({
  source: source({
    id: runUuid,
    endState: 'CapReached',
    errorCode: 'RST-1403',
    supportedClaims: 0,
  }),
});

it('RF-615 RF-1015 the page of an ended understand run shows the journey of that run', async () => {
  const page = await openEnded({
    extra: {
      [`GET ${journeyPath}`]: json(200, {
        ...roadSigns['asking'],
        source: source({ id: runUuid, openQuestions: 3 }),
      }),
    },
  });

  await screen.findByRole('region', { name: 'Journey from code to package' });

  expect(page.calls.map((call) => call.path)).toContain(journeyPath);
  expect(strip().textContent).toContain('3 open questions');
});

it('RF-615 the strip comes before the tabs of the results', async () => {
  await openEnded({ extra: { [`GET ${journeyPath}`]: json(200, mine) } });
  await screen.findByRole('region', { name: 'Journey from code to package' });

  const results = screen.getByRole('region', { name: 'Results' });

  expect(strip().compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('RF-615 Answer questions in the strip opens the Your questions tab of the page', async () => {
  await openEnded({
    extra: {
      [`GET ${journeyPath}`]: json(200, {
        ...mine,
        source: source({ id: runUuid, openQuestions: 3 }),
      }),
    },
  });
  await screen.findByRole('region', { name: 'Journey from code to package' });

  fireEvent.click(within(strip()).getByRole('button', { name: 'Answer 3 questions' }));

  await waitFor(() => {
    expect(
      screen.getByRole('tab', { name: /^Your questions/u }).getAttribute('aria-selected'),
    ).toBe('true');
  });
});

it('RF-615 RF-006 a stopped understand run shows Resume in the strip, which resumes this run', async () => {
  const page = await openEnded({
    endState: 'CapReached',
    extra: {
      [`GET ${journeyPath}`]: json(200, stopped),
      [`POST ${runPath}/resume`]: json(202, { id: runUuid }),
    },
  });
  await screen.findByRole('region', { name: 'Journey from code to package' });

  fireEvent.click(within(strip()).getByRole('button', { name: 'Resume this run' }));

  await waitFor(() => {
    expect(page.calls.map((call) => `${call.method} ${call.path}`)).toContain(
      `POST ${runPath}/resume`,
    );
  });
  expect(strip().textContent).toContain('Stopped at its cap (RST-1403)');
});

it('RF-615 the page of a run that is still running shows no strip and asks for no facts', async () => {
  const page = renderLive();
  await screen.findByRole('tablist');

  expect(screen.queryByRole('region', { name: 'Journey from code to package' })).toBeNull();
  expect(page.calls.map((call) => call.path)).not.toContain(journeyPath);
});

it('RF-615 the page of a plan run shows the journey while the plan runs and after it ends', async () => {
  let reads = 0;
  const read = (): Response =>
    json(200, reads++ === 0 ? roadSigns['planning'] : roadSigns['failed']);
  const page = renderLive({
    [`GET ${runPath}`]: runRow({ stage: 'plan', queueState: 'Running' }),
    [`GET /api/projects/${projectId}/journey?run=${runUuid}`]: read,
  });
  const connection = await page.stream.connection();
  connection.event(ev(1, 'run.started', { ...startedData, stage: 'plan' }));
  await waitFor(() => {
    expect(strip().textContent).toContain('Running now');
  });

  connection.event(runEnded(2, 'Failed'));

  await waitFor(() => {
    expect(strip().textContent).toContain('Try the plan again');
  });
  expect(reads).toBe(2);
});

it('RF-615 answering a question on the page reads the journey again', async () => {
  const answersPath = `${runPath}/answers`;
  const page = await openEnded({
    questions: [question(1), question(2)],
    extra: {
      [`GET ${journeyPath}`]: json(200, mine),
      [`PUT ${answersPath}`]: json(200, {
        questions: [question(1, { state: 'Answered', answer: 'Staff only.' }), question(2)],
      }),
    },
  });
  await screen.findByRole('region', { name: 'Journey from code to package' });
  fireEvent.click(screen.getByRole('tab', { name: /^Your questions/u }));
  const first = screen.getByText('OQ-001').closest('li');
  if (first === null) throw new Error('The first question is not listed.');

  fireEvent.input(within(first).getByLabelText('Answer to OQ-001'), {
    target: { value: 'Staff only.' },
  });
  fireEvent.click(within(first).getByRole('button', { name: 'Save answer' }));

  await waitFor(() => {
    const reads = page.calls.filter((call) => call.path === journeyPath);
    expect(reads).toHaveLength(2);
  });
});
