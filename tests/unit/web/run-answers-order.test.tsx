import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { json, renderPage } from './fake-api.js';
import { AnswersHarness } from './run-answers-harness.js';

// RF-1007 (P8-85, UX-25): the questions are listed in id order, the ones that wait for an answer
// first; a question whose answer is saved moves to the collapsed "Answered" list at once, and one
// whose answer is cleared moves back.

const runId = '2f0c4b1e-0000-4000-8000-000000000001';
const route = `/api/runs/${runId}/answers`;

const row = (cardId: string, extra: Record<string, unknown> = {}) => ({
  ...{ cardId, question: `Question ${cardId}?`, context: 'a.cs:1-2 ctx', answer: '' },
  ...{ state: 'Open', dependents: 0 },
  ...extra,
});

const answers = (body: unknown, saved?: unknown) =>
  renderPage(<AnswersHarness runId={runId} ended />, {
    [`GET ${route}`]: json(200, { questions: body, deepens: 1, isDeepen: false }),
    ...(saved === undefined ? {} : { [`PUT ${route}`]: json(200, { questions: saved }) }),
  });

const idsIn = (element: HTMLElement): string[] =>
  within(element)
    .getAllByTestId('open-question')
    .map((item) => /OQ-\d+/u.exec(item.textContent)?.[0] ?? '');

/** The questions outside the collapsed Answered list, in the order they are shown. */
const waiting = (): string[] => {
  const all = screen.getAllByTestId('open-question');
  const answered = screen.queryByTestId('answered-questions');
  return all
    .filter((item) => answered?.contains(item) !== true)
    .map((item) => /OQ-\d+/u.exec(item.textContent)?.[0] ?? '');
};

const itemOf = (cardId: string): HTMLElement => {
  const found = screen
    .getAllByTestId('open-question')
    .find((item) => item.textContent.includes(cardId));
  if (found === undefined) throw new Error(`No question ${cardId}.`);
  return found;
};

describe('RF-1007 the order of the questions', () => {
  it('RF-1007 lists the questions in id order, the ones that wait for an answer first', async () => {
    answers([
      row('OQ-010'),
      row('OQ-003'),
      row('OQ-004', { answer: 'Saved.' }),
      row('OQ-002'),
      row('OQ-001', { answer: 'Used.', state: 'Answered' }),
    ]);

    const answered = await screen.findByTestId('answered-questions');

    expect(waiting()).toEqual(['OQ-002', 'OQ-003', 'OQ-010']);
    expect(idsIn(answered)).toEqual(['OQ-001', 'OQ-004']);
  });
});

describe('RF-1007 an answered question moves to Answered', () => {
  it('RF-1007 a saved answer moves its question to the Answered list at once', async () => {
    const page = answers(
      [row('OQ-002'), row('OQ-001')],
      [row('OQ-002'), row('OQ-001', { answer: 'Yes.' })],
    );
    await screen.findByLabelText('Answer to OQ-001');
    expect(screen.queryByTestId('answered-questions')).toBeNull();

    fireEvent.input(screen.getByLabelText('Answer to OQ-001'), { target: { value: 'Yes.' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save answers/u }));

    const answered = await screen.findByTestId('answered-questions');
    expect(page.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
    expect(answered.hasAttribute('open')).toBe(false);
    expect(within(answered).getByText('Answered (1)')).toBeTruthy();
    expect(idsIn(answered)).toEqual(['OQ-001']);
    expect(waiting()).toEqual(['OQ-002']);
    const moved = within(answered).getByTestId('open-question');
    expect(within(moved).getByTestId('status-badge').textContent).toContain('Answer saved');
    expect(moved.textContent).toContain('Answer saved in answers.md.');
    expect(screen.getByTestId('answers-status').textContent).toContain('1 question waits');
  });

  it('RF-1007 a cleared answer moves its question back to the questions that wait', async () => {
    answers([row('OQ-001', { answer: 'Yes.' })], [row('OQ-001')]);
    const answered = await screen.findByTestId('answered-questions');

    fireEvent.input(within(answered).getByLabelText('Answer to OQ-001'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save answers/u }));

    await waitFor(() => {
      expect(screen.queryByTestId('answered-questions')).toBeNull();
    });
    expect(waiting()).toEqual(['OQ-001']);
    expect(screen.getByTestId('open-question').textContent).toContain(
      'Answer cleared in answers.md.',
    );
  });
});
