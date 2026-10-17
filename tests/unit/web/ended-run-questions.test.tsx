import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { json } from './fake-api.js';
import { runPath } from './live-run-helpers.js';
import { openEnded, question } from './ended-run-helpers.js';
import { tab } from './live-run-running-helpers.js';

// RF-1017, RF-1007, RF-240, RF-243 (P1-170): the "Your questions" tab of an ended run: the question,
// why the code cannot answer it with its citation, how many items depend on it, an answer field and
// the default that applies if it is skipped. Answering still writes the project's answers.md.

afterEach(() => {
  vi.unstubAllGlobals();
});

const answersPath = `${runPath}/answers`;

function item(cardId: string): HTMLElement {
  const found = screen
    .getAllByTestId('open-question')
    .find((each) => each.textContent.includes(cardId));
  if (found === undefined) throw new Error(`No question ${cardId}.`);
  return found;
}

it('RF-1017 each question shows the question, its citation, what depends on it, an answer field and the default', async () => {
  await openEnded({
    questions: [question(3, { question: 'Who may cancel an order?', dependents: 6 })],
  });

  fireEvent.click(tab('Your questions'));

  const shown = item('OQ-003');
  expect(shown.textContent).toContain('Who may cancel an order?');
  expect(within(shown).getByTestId('question-why').textContent).toContain('Orders/Order.cs:3-7');
  expect(within(shown).getByTestId('question-why').textContent).toContain('The code does not say.');
  expect(within(shown).getByTestId('question-depends').textContent).toContain('6 items');
  expect(within(shown).getByLabelText('Answer to OQ-003')).toBeTruthy();
  expect(within(shown).getByTestId('question-default').textContent).toContain('If you skip it');
});

it('RF-1017 says in words when one item or nothing depends on a question', async () => {
  await openEnded({
    questions: [question(1, { dependents: 1 }), question(2, { dependents: 0 })],
  });

  fireEvent.click(tab('Your questions'));

  expect(within(item('OQ-001')).getByTestId('question-depends').textContent).toContain('1 item');
  expect(within(item('OQ-001')).getByTestId('question-depends').textContent).not.toContain(
    '1 items',
  );
  expect(within(item('OQ-002')).getByTestId('question-depends').textContent).toContain(
    'No other item',
  );
});

it('RF-1017 RF-507 the question and its citation are shown as text', async () => {
  await openEnded({
    questions: [
      question(1, {
        question: '<img src=x onerror=alert(1)> Who?',
        context: 'a.cs:1-2 <script>window.__pwned = 1</script>',
      }),
    ],
  });

  fireEvent.click(tab('Your questions'));

  const shown = item('OQ-001');
  expect(shown.textContent).toContain('<img src=x onerror=alert(1)> Who?');
  expect(shown.querySelector('img, script')).toBeNull();
});

it('RF-1007 RF-240 answering from the tab writes the answer through the answers route', async () => {
  const { calls } = await openEnded({
    questions: [question(1), question(2)],
    extra: {
      [`PUT ${answersPath}`]: json(200, {
        questions: [question(1, { answer: 'Staff only.' }), question(2)],
      }),
    },
  });
  fireEvent.click(tab('Your questions'));

  fireEvent.input(within(item('OQ-001')).getByLabelText('Answer to OQ-001'), {
    target: { value: 'Staff only.' },
  });
  fireEvent.click(within(item('OQ-001')).getByRole('button', { name: 'Save answer' }));

  await waitFor(() => {
    expect(within(item('OQ-001')).getByRole('status').textContent).toContain(
      'Answer saved in answers.md.',
    );
  });
  const put = calls.find((call) => call.method === 'PUT');
  expect(put).toMatchObject({
    path: answersPath,
    body: { answers: [{ cardId: 'OQ-001', answer: 'Staff only.' }] },
  });
});

it('RF-1017 the tab count and the Your turn count follow the open questions only', async () => {
  await openEnded({
    questions: [question(1), question(2, { state: 'Answered', answer: 'Yes.' })],
  });

  await waitFor(() => {
    expect(tab('Your questions').textContent).toContain('1');
  });
  expect(screen.getByRole('region', { name: 'Your turn' }).textContent).toContain('1 question');
});
