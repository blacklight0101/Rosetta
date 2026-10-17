import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { AnswersHarness } from './run-answers-harness.js';

// RF-1007, RF-507: the open questions of a run on its live page. Each one has an answer field;
// saving sends the answer to PUT /api/runs/:runId/answers and shows what the server recorded.

const runId = '2f0c4b1e-0000-4000-8000-000000000001';
const route = `/api/runs/${runId}/answers`;

const questions = [
  {
    cardId: 'OQ-001',
    question: 'Is a sold-out item still shown?',
    context: 'Catalog/Default.aspx.cs:41-58 The list filters on <b>stock</b>.',
    answer: '',
    state: 'Open',
    dependents: 3,
  },
  {
    cardId: 'OQ-002',
    question: 'Who may edit prices?',
    context: 'Catalog/Edit.aspx.cs:3-9 Only one role edits.',
    answer: 'Managers.',
    state: 'Answered',
    dependents: 0,
  },
];

function renderAnswers(answers: Readonly<Record<string, Answer>>, ended = true) {
  return renderPage(<AnswersHarness runId={runId} ended={ended} />, answers);
}

const item = (cardId: string): HTMLElement => {
  const found = screen
    .getAllByTestId('open-question')
    .find((each) => each.textContent.includes(cardId));
  if (found === undefined) throw new Error(`No question ${cardId}.`);
  return found;
};

function valueOf(element: HTMLElement): string {
  return element instanceof HTMLTextAreaElement ? element.value : '';
}

describe('open questions on the live run page', () => {
  it('RF-1007 waits for the end of the run before it reads the questions', () => {
    const page = renderAnswers({ [`GET ${route}`]: json(200, { questions }) }, false);

    expect(screen.getByRole('region', { name: 'Open questions' }).textContent).toContain(
      'The open questions appear here when the run ends.',
    );
    expect(page.calls).toEqual([]);
  });

  it('RF-1007 RF-507 lists each question as Open with its context as text and its saved answer', async () => {
    renderAnswers({ [`GET ${route}`]: json(200, { questions }) });

    await waitFor(() => {
      expect(screen.getAllByTestId('open-question')).toHaveLength(2);
    });
    const first = item('OQ-001');
    expect(first.textContent).toContain('Is a sold-out item still shown?');
    expect(first.textContent).toContain('The list filters on <b>stock</b>.');
    expect(first.querySelector('b')).toBeNull();
    expect(within(first).getByTestId('status-badge').textContent).toContain('Open');
    expect(valueOf(within(item('OQ-002')).getByLabelText('Answer to OQ-002'))).toBe('Managers.');
  });

  it('RF-1007 RF-241 shows a question the re-run answered as Answered', async () => {
    renderAnswers({ [`GET ${route}`]: json(200, { questions }) });

    await waitFor(() => {
      expect(screen.getAllByTestId('open-question')).toHaveLength(2);
    });

    expect(within(item('OQ-002')).getByTestId('status-badge').textContent).toContain('Answered');
    expect(within(item('OQ-002')).getByTestId('status-badge').textContent).not.toContain('Open');
  });
});

describe('saving an answer on the live run page', () => {
  it('RF-1007 saves one answer and shows what answers.md now holds', async () => {
    const page = renderAnswers({
      [`GET ${route}`]: json(200, { questions }),
      [`PUT ${route}`]: json(200, {
        questions: [{ ...questions[0], answer: 'Yes, greyed out.' }, questions[1]],
      }),
    });
    const field = await within(
      await screen.findByRole('region', { name: 'Open questions' }),
    ).findByLabelText('Answer to OQ-001');

    fireEvent.input(field, { target: { value: 'Yes,\ngreyed out.' } });
    fireEvent.click(within(item('OQ-001')).getByRole('button', { name: 'Save answer' }));

    await waitFor(() => {
      expect(within(item('OQ-001')).getByRole('status').textContent).toContain(
        'Answer saved in answers.md.',
      );
    });
    const put = page.calls.find((call) => call.method === 'PUT');
    expect(put).toMatchObject({
      path: route,
      csrf: 'csrf-0',
      body: { answers: [{ cardId: 'OQ-001', answer: 'Yes,\ngreyed out.' }] },
    });
    expect(valueOf(within(item('OQ-001')).getByLabelText('Answer to OQ-001'))).toBe(
      'Yes, greyed out.',
    );
    expect(valueOf(within(item('OQ-002')).getByLabelText('Answer to OQ-002'))).toBe('Managers.');
  });
});

describe('clearing and refused answers on the live run page', () => {
  it('RF-1007 says when an empty answer cleared the saved one', async () => {
    renderAnswers({
      [`GET ${route}`]: json(200, { questions }),
      [`PUT ${route}`]: json(200, { questions: [questions[0], { ...questions[1], answer: '' }] }),
    });
    const field = await screen.findByLabelText('Answer to OQ-002');

    fireEvent.input(field, { target: { value: '' } });
    fireEvent.click(within(item('OQ-002')).getByRole('button', { name: 'Save answer' }));

    await waitFor(() => {
      expect(within(item('OQ-002')).getByRole('status').textContent).toContain(
        'Answer cleared in answers.md.',
      );
    });
  });

  it('RF-1007 shows the code and message of a refused save and keeps the typed answer', async () => {
    renderAnswers({
      [`GET ${route}`]: json(200, { questions }),
      [`PUT ${route}`]: failure(400, 'RST-2000'),
    });
    const field = await screen.findByLabelText('Answer to OQ-001');

    fireEvent.input(field, { target: { value: 'Maybe.' } });
    fireEvent.click(within(item('OQ-001')).getByRole('button', { name: 'Save answer' }));

    await waitFor(() => {
      expect(item('OQ-001').textContent).toContain('RST-2000');
    });
    expect(valueOf(within(item('OQ-001')).getByLabelText('Answer to OQ-001'))).toBe('Maybe.');
  });
});

describe('empty and failed lists of open questions', () => {
  it('RF-1007 says when the run added no open questions', async () => {
    renderAnswers({ [`GET ${route}`]: json(200, { questions: [] }) });

    expect(await screen.findByText('This run added no open questions.')).toBeDefined();
  });

  it('RF-1105 shows the error when the questions cannot be read', async () => {
    renderAnswers({ [`GET ${route}`]: failure(404, 'RST-2003') });

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Open questions' }).textContent).toContain(
        'RST-2003',
      );
    });
  });
});
