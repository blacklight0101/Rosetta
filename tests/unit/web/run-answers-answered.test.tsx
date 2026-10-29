import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { json, renderPage } from './fake-api.js';
import { AnswersHarness } from './run-answers-harness.js';

// RF-646, RF-1007, DEC-179, DEC-154: the Your questions page lists the questions still open first and
// the answered ones (a run used their answer) in a collapsed "Answered" list that can be edited; a
// question whose answer is only saved stays with the open ones, so it can still be changed after the
// page is read again. A question raised in several runs is listed once and its older answers are
// shown as text.

const runId = '2f0c4b1e-0000-4000-8000-000000000001';
const route = `/api/runs/${runId}/answers`;

const row = (cardId: string, extra: Record<string, unknown>) => ({
  ...{ cardId, question: `Question ${cardId}?`, context: 'a.cs:1-2 ctx', answer: '' },
  ...{ state: 'Open', dependents: 0 },
  ...extra,
});

const answeredRow = row('OQ-002', {
  answer: 'Managers.',
  state: 'Answered',
  runs: ['a', 'b'],
  history: [{ runKey: 'a', answer: '<b>Nobody</b>' }],
});
const questions = [row('OQ-001', {}), answeredRow];

function open(body: unknown = { questions, deepens: 1, isDeepen: false }) {
  return renderPage(<AnswersHarness runId={runId} ended />, {
    [`GET ${route}`]: json(200, body),
    [`PUT ${route}`]: json(200, {
      questions: [questions[0], { ...answeredRow, answer: 'Nobody.' }],
    }),
  });
}

it('RF-646 lists the open questions first and the answered ones in a collapsed Answered list', async () => {
  open();

  const answered = await screen.findByTestId('answered-questions');

  expect(answered.tagName).toBe('DETAILS');
  expect(answered.hasAttribute('open')).toBe(false);
  expect(within(answered).getByText('Answered (1)')).toBeTruthy();
  expect(within(answered).getAllByTestId('open-question')).toHaveLength(1);
  expect(screen.getAllByTestId('open-question')[0]?.textContent).toContain('OQ-001');
});

it('RF-646 RF-1007 an answered question can be edited in the Answered list', async () => {
  const page = open();
  const answered = await screen.findByTestId('answered-questions');

  fireEvent.input(within(answered).getByLabelText('Answer to OQ-002'), {
    target: { value: 'Nobody.' },
  });
  fireEvent.click(within(answered).getByRole('button', { name: 'Save answer' }));

  await waitFor(() => {
    expect(page.calls.some((call) => call.method === 'PUT')).toBe(true);
  });
});

it('RF-646 RF-507 says a question was raised in several runs and shows the older answers as text', async () => {
  open();

  const earlier = await screen.findByTestId('question-earlier');

  expect(earlier.textContent).toContain('Asked in 2 runs');
  expect(earlier.textContent).toContain('<b>Nobody</b>');
  expect(earlier.querySelector('b')).toBeNull();
});

it('RF-646 says no question waits when every question is answered', async () => {
  open({ questions: [answeredRow], deepens: 1, isDeepen: false });

  expect((await screen.findByTestId('no-open-questions')).textContent).toContain(
    'No question waits for an answer.',
  );
});

const options = [
  { answer: 'Yes, show it', description: 'Keep the list.', recommended: true },
  { answer: 'No, hide it', description: 'Hide the item.', recommended: false },
];
const savedRow = row('OQ-001', { answer: 'No, hide it', chosen: '2', options });
const typed = 'Only while in stock.';

it('RF-646 RF-645 a question with a saved answer stays with the open ones when the page is read again, and can be changed there', async () => {
  const page = renderPage(<AnswersHarness runId={runId} ended />, {
    [`GET ${route}`]: json(200, { questions: [savedRow], deepens: 1, isDeepen: false }),
    [`PUT ${route}`]: json(200, {
      questions: [{ ...savedRow, answer: typed, chosen: 'typed' }],
    }),
  });
  const list = async () => within(await screen.findByRole('region', { name: 'Open questions' }));

  expect((await screen.findByTestId('no-open-questions')).textContent).toContain(
    'No question waits',
  );
  expect(screen.queryByTestId('answered-questions')).toBeNull();
  expect((await list()).getByRole('radio', { name: /No, hide it/u })).toHaveProperty(
    'checked',
    true,
  );
  fireEvent.click((await list()).getByRole('radio', { name: 'Type your own answer' }));
  fireEvent.input((await list()).getByLabelText('Answer to OQ-001'), { target: { value: typed } });
  fireEvent.click((await list()).getByRole('button', { name: 'Save answer' }));

  await waitFor(() => {
    expect(screen.getByTestId('open-question').textContent).toContain(
      'Answer saved in answers.md.',
    );
  });
  expect(page.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
  expect(screen.queryByTestId('answered-questions')).toBeNull();
  expect(screen.getByLabelText('Answer to OQ-001')).toHaveProperty('value', typed);
});
