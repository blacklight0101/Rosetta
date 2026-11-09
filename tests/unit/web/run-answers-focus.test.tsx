import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { json, renderPage } from './fake-api.js';
import { AnswersHarness } from './run-answers-harness.js';

// RF-1007 (P8-85, UX-25): a saved answer moves its question to the Answered list and the Save
// button unmounts; the focus must not fall to the page. It goes to the next question that waits,
// or to the Answered summary when none is left.

const runId = '2f0c4b1e-0000-4000-8000-000000000001';
const route = `/api/runs/${runId}/answers`;

const row = (cardId: string, extra: Record<string, unknown> = {}) => ({
  ...{ cardId, question: `Question ${cardId}?`, context: 'a.cs:1-2 ctx', answer: '' },
  ...{ state: 'Open', dependents: 0 },
  ...extra,
});

const answers = (body: unknown, saved: unknown) =>
  renderPage(<AnswersHarness runId={runId} ended />, {
    [`GET ${route}`]: json(200, { questions: body, deepens: 1, isDeepen: false }),
    [`PUT ${route}`]: json(200, { questions: saved }),
  });

const save = (cardId: string, value: string): void => {
  const item = screen
    .getAllByTestId('open-question')
    .find((element) => element.textContent.includes(cardId));
  if (item === undefined) throw new Error(`No question ${cardId}.`);
  fireEvent.input(within(item).getByLabelText(`Answer to ${cardId}`), { target: { value } });
  fireEvent.click(within(item).getByRole('button', { name: 'Save answer' }));
};

describe('RF-1007 the focus after a saved answer moves its question', () => {
  it('RF-1007 goes to the first control of the next question that waits', async () => {
    answers([row('OQ-001'), row('OQ-002')], [row('OQ-001', { answer: 'Yes.' }), row('OQ-002')]);
    await screen.findByLabelText('Answer to OQ-001');

    save('OQ-001', 'Yes.');

    await screen.findByTestId('answered-questions');
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Answer to OQ-002'));
    });
  });

  it('RF-1007 goes to the Answered summary when no question waits any longer', async () => {
    answers([row('OQ-001')], [row('OQ-001', { answer: 'Yes.' })]);
    await screen.findByLabelText('Answer to OQ-001');

    save('OQ-001', 'Yes.');

    const answered = await screen.findByTestId('answered-questions');
    await waitFor(() => {
      expect(document.activeElement).toBe(answered.querySelector('summary'));
    });
  });

  it('RF-1007 stays in the question that moved back to the ones that wait', async () => {
    answers([row('OQ-001', { answer: 'Yes.' })], [row('OQ-001')]);
    const answered = await screen.findByTestId('answered-questions');
    fireEvent.input(within(answered).getByLabelText('Answer to OQ-001'), {
      target: { value: '' },
    });
    fireEvent.click(within(answered).getByRole('button', { name: 'Save answer' }));

    await waitFor(() => {
      expect(screen.queryByTestId('answered-questions')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Answer to OQ-001'));
    });
  });
});
