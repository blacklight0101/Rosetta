import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { json, renderPage, type Answer } from './fake-api.js';
import { AnswersHarness } from './run-answers-harness.js';

// RF-645, RF-1007, DEC-178: a question with suggested answers shows them as choices, the recommended
// one first, plus "Type your own answer"; a question saved before the change keeps its free field.

const runId = '2f0c4b1e-0000-4000-8000-000000000001';
const route = `/api/runs/${runId}/answers`;

const options = [
  { answer: 'Yes, show it', description: 'Keep the list.', recommended: true },
  { answer: 'No, hide it', description: 'Hide the item.', recommended: false },
  { answer: 'Only in stock', description: 'Name the condition.', recommended: false },
];

const withOptions = {
  cardId: 'OQ-001',
  question: 'Is a sold-out item still shown?',
  context: 'Catalog/Default.aspx.cs:41-58 filters.',
  answer: '',
  state: 'Open',
  dependents: 0,
  options,
  chosen: '',
};
const legacy = { ...withOptions, cardId: 'OQ-002', options: undefined, chosen: undefined };

function renderAnswers(answers: Readonly<Record<string, Answer>>) {
  return renderPage(<AnswersHarness runId={runId} ended />, answers);
}

const item = (cardId: string): HTMLElement => {
  const found = screen
    .getAllByTestId('open-question')
    .find((each) => each.textContent.includes(cardId));
  if (found === undefined) throw new Error(`No question ${cardId}.`);
  return found;
};

describe('suggested answers on the answers page', () => {
  it('RF-645 shows the options as radios, the recommended first and marked, plus a typed option', async () => {
    renderAnswers({ [`GET ${route}`]: json(200, { questions: [withOptions, legacy] }) });
    await screen.findAllByTestId('open-question');

    const radios = within(item('OQ-001')).getAllByRole('radio');

    expect(radios.map((each) => each.closest('.rst-plan-opt')?.textContent)).toEqual([
      expect.stringContaining('(Recommended) Yes, show it'),
      expect.stringContaining('No, hide it'),
      expect.stringContaining('Only in stock'),
      expect.stringContaining('Type your own answer'),
    ]);
    expect(radios.every((each) => (each as HTMLInputElement).checked)).toBe(false);
    expect(within(item('OQ-001')).queryByLabelText('Answer to OQ-001')).toBeNull();
  });

  it('RF-645 a question saved before the change keeps its free answer field and no radios', async () => {
    renderAnswers({ [`GET ${route}`]: json(200, { questions: [withOptions, legacy] }) });
    await screen.findAllByTestId('open-question');

    expect(within(item('OQ-002')).queryAllByRole('radio')).toHaveLength(0);
    expect(within(item('OQ-002')).getByLabelText('Answer to OQ-002')).toBeTruthy();
  });
});

describe('saving suggested answers on the answers page', () => {
  it('RF-645 RF-1007 saving a chosen option sends its number and its answer', async () => {
    const saved = { ...withOptions, answer: 'No, hide it', chosen: '2' };
    const page = renderAnswers({
      [`GET ${route}`]: json(200, { questions: [withOptions] }),
      [`PUT ${route}`]: json(200, { questions: [saved] }),
    });
    await screen.findAllByTestId('open-question');

    fireEvent.click(within(item('OQ-001')).getByRole('radio', { name: /No, hide it/u }));
    fireEvent.click(within(item('OQ-001')).getByRole('button', { name: 'Save answer' }));

    await waitFor(() => {
      expect(within(item('OQ-001')).getByRole('status').textContent).toContain(
        'Answer saved in answers.md.',
      );
    });
    expect(page.calls.find((call) => call.method === 'PUT')?.body).toEqual({
      answers: [{ cardId: 'OQ-001', answer: 'No, hide it', chosen: 2 }],
    });
    const radio = within(item('OQ-001')).getByRole('radio', { name: /No, hide it/u });
    expect((radio as HTMLInputElement).checked).toBe(true);
  });

  it('RF-645 RF-1007 typing your own answer shows the field and sends it as typed', async () => {
    const page = renderAnswers({
      [`GET ${route}`]: json(200, { questions: [withOptions] }),
      [`PUT ${route}`]: json(200, {
        questions: [{ ...withOptions, answer: 'Staff only.', chosen: 'typed' }],
      }),
    });
    await screen.findAllByTestId('open-question');

    fireEvent.click(within(item('OQ-001')).getByRole('radio', { name: /Type your own answer/u }));
    fireEvent.input(within(item('OQ-001')).getByLabelText('Answer to OQ-001'), {
      target: { value: 'Staff only.' },
    });
    fireEvent.click(within(item('OQ-001')).getByRole('button', { name: 'Save answer' }));

    await waitFor(() => {
      expect(page.calls.some((call) => call.method === 'PUT')).toBe(true);
    });
    expect(page.calls.find((call) => call.method === 'PUT')?.body).toEqual({
      answers: [{ cardId: 'OQ-001', answer: 'Staff only.', chosen: 'typed' }],
    });
  });
});

describe('suggested answers already answered or hostile', () => {
  it('RF-645 a question answered by typing opens with the typed option and its text', async () => {
    renderAnswers({
      [`GET ${route}`]: json(200, {
        questions: [{ ...withOptions, answer: 'Staff only.', chosen: 'typed' }],
      }),
    });
    await screen.findAllByTestId('open-question');

    const field = within(item('OQ-001')).getByLabelText('Answer to OQ-001');

    expect((field as HTMLTextAreaElement).value).toBe('Staff only.');
  });

  it('RF-645 option text from the model is shown as text, never as HTML', async () => {
    const hostile = [{ answer: '<b>bold</b>', description: '<img src=x>', recommended: true }];
    renderAnswers({
      [`GET ${route}`]: json(200, { questions: [{ ...withOptions, options: hostile }] }),
    });
    await screen.findAllByTestId('open-question');

    expect(item('OQ-001').textContent).toContain('<b>bold</b>');
    expect(item('OQ-001').querySelector('b, img')).toBeNull();
  });
});
