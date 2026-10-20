import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { openEnded, question } from './ended-run-helpers.js';
import { facts, projectId, source } from './journey-fixtures.js';
import { runPath, runUuid } from './live-run-helpers.js';
import { tab } from './live-run-running-helpers.js';

// RF-615, RF-1007, DEC-154: a saved answer moves the journey on. A question with an answer in
// answers.md reads "Answer saved" and is not open, in the tab, Your turn and the journey; saving the
// last answer moves the journey to the brief without a reload; clearing an answer opens it again;
// "Answer N questions" opens the Your questions tab and focuses the first question without an answer.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const answersPath = `${runPath}/answers`;
const journeyPath = `/api/projects/${projectId}/journey?run=${runUuid}`;
const strip = (): HTMLElement =>
  screen.getByRole('region', { name: 'Journey from code to package' });
const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });
const saved = (n: number) => question(n, { answer: 'Staff only.' });

function item(cardId: string): HTMLElement {
  const found = screen
    .getAllByTestId('open-question')
    .find((each) => each.textContent.includes(cardId));
  if (found === undefined) throw new Error(`No question ${cardId}.`);
  return found;
}

/** The journey the server would answer: the questions step follows how many answers are saved. */
function journeyAfter(state: { open: number }) {
  return () =>
    json(200, {
      ...facts({ briefSaved: false }),
      source: source({ id: runUuid, openQuestions: state.open }),
    });
}

/** Waits for the journey strip to show the button, so the first read has happened. */
async function stripShows(name: string): Promise<void> {
  const region = await screen.findByRole('region', { name: 'Journey from code to package' });
  await within(region).findByRole('button', { name });
}

function saveAnswer(cardId: string, text: string): void {
  fireEvent.input(within(item(cardId)).getByLabelText(`Answer to ${cardId}`), {
    target: { value: text },
  });
  fireEvent.click(within(item(cardId)).getByRole('button', { name: 'Save answer' }));
}

it('RF-615 a question with a saved answer reads Answer saved and not Open', async () => {
  await openEnded({ questions: [saved(1), question(2)] });

  fireEvent.click(tab('Your questions'));

  expect(within(item('OQ-001')).getByTestId('status-badge').textContent).toBe('Answer saved');
  expect(within(item('OQ-002')).getByTestId('status-badge').textContent).toBe('Open');
});

it('RF-615 a question Answered by a later run still reads Answered', async () => {
  await openEnded({ questions: [question(1, { state: 'Answered', answer: 'Yes.' })] });

  fireEvent.click(tab('Your questions'));

  expect(within(item('OQ-001')).getByTestId('status-badge').textContent).toBe('Answered');
});

it('RF-615 the tab count and Your turn count only the questions without a saved answer', async () => {
  await openEnded({ questions: [saved(1), question(2), question(3)] });

  await waitFor(() => {
    expect(tab('Your questions').textContent).toContain('2');
  });
  expect(within(turn()).getByRole('button', { name: 'Answer 2 questions' })).toBeTruthy();
});

it('RF-615 Your turn with every answer saved offers the plan and no questions', async () => {
  await openEnded({ questions: [saved(1), saved(2)] });

  await waitFor(() => {
    expect(turn().textContent).toContain('saved answer');
  });
  expect(within(turn()).queryByRole('button', { name: /^Answer / })).toBeNull();
  expect(within(turn()).getByRole('button', { name: 'Set up the plan' })).toBeTruthy();
});

it('RF-615 saving the last answer moves the journey to the brief without reloading the page', async () => {
  const server = { open: 1 };
  const { calls } = await openEnded({
    questions: [saved(1), question(2)],
    extra: {
      [`GET ${journeyPath}`]: journeyAfter(server),
      [`PUT ${answersPath}`]: () => {
        server.open = 0;
        return json(200, { questions: [saved(1), saved(2)] });
      },
    },
  });
  await stripShows('Answer 1 question');
  fireEvent.click(tab('Your questions'));

  saveAnswer('OQ-002', 'Staff only.');

  await within(strip()).findByRole('button', { name: 'Set up the plan' });
  expect(within(strip()).queryByRole('button', { name: /^Answer / })).toBeNull();
  expect(calls.filter((call) => call.path === journeyPath).length).toBeGreaterThan(1);
});

it('RF-615 saving some answers drops the count and keeps Go on with the defaults', async () => {
  const server = { open: 3 };
  await openEnded({
    questions: [question(1), question(2), question(3)],
    extra: {
      [`GET ${journeyPath}`]: journeyAfter(server),
      [`PUT ${answersPath}`]: () => {
        server.open = 2;
        return json(200, { questions: [saved(1), question(2), question(3)] });
      },
    },
  });
  await stripShows('Answer 3 questions');
  fireEvent.click(tab('Your questions'));

  saveAnswer('OQ-001', 'Staff only.');

  await within(strip()).findByRole('button', { name: 'Answer 2 questions' });
  expect(within(strip()).getByRole('button', { name: 'Go on with the defaults' })).toBeTruthy();
});

it('RF-615 clearing a saved answer counts the question as open again', async () => {
  const server = { open: 0 };
  await openEnded({
    questions: [saved(1)],
    extra: {
      [`GET ${journeyPath}`]: journeyAfter(server),
      [`PUT ${answersPath}`]: () => {
        server.open = 1;
        return json(200, { questions: [question(1)] });
      },
    },
  });
  await stripShows('Set up the plan');
  fireEvent.click(tab('Your questions'));

  saveAnswer('OQ-001', '');

  await within(strip()).findByRole('button', { name: 'Answer 1 question' });
  expect(within(turn()).getByRole('button', { name: 'Answer 1 question' })).toBeTruthy();
  expect(within(item('OQ-001')).getByTestId('status-badge').textContent).toBe('Open');
});

it('RF-615 Answer questions from another tab opens Your questions and focuses the first without an answer', async () => {
  await openEnded({ questions: [saved(1), question(2), question(3)] });
  await waitFor(() => {
    expect(tab('Your questions').textContent).toContain('2');
  });

  fireEvent.click(within(turn()).getByRole('button', { name: 'Answer 2 questions' }));

  await waitFor(() => {
    expect(document.activeElement).toBe(within(item('OQ-002')).getByLabelText('Answer to OQ-002'));
  });
});

it('RF-615 Answer questions while already on the tab moves focus to the first without an answer', async () => {
  await openEnded({ questions: [saved(1), question(2)] });
  fireEvent.click(tab('Your questions'));
  within(item('OQ-001')).getByLabelText('Answer to OQ-001').focus();

  fireEvent.click(within(turn()).getByRole('button', { name: 'Answer 1 question' }));

  await waitFor(() => {
    expect(document.activeElement).toBe(within(item('OQ-002')).getByLabelText('Answer to OQ-002'));
  });
});

it('RF-615 choosing Answer questions again moves focus back to the first question without an answer', async () => {
  await openEnded({ questions: [question(1), question(2)] });
  fireEvent.click(within(turn()).getByRole('button', { name: 'Answer 2 questions' }));
  await waitFor(() => {
    expect(document.activeElement).toBe(within(item('OQ-001')).getByLabelText('Answer to OQ-001'));
  });
  within(item('OQ-002')).getByLabelText('Answer to OQ-002').focus();

  fireEvent.click(within(turn()).getByRole('button', { name: 'Answer 2 questions' }));

  await waitFor(() => {
    expect(document.activeElement).toBe(within(item('OQ-001')).getByLabelText('Answer to OQ-001'));
  });
});
