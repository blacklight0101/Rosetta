import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { AnswersHarness } from './run-answers-harness.js';

// RF-241, RF-1007: an Answered question can be reopened, so an answer edited after that is used by the
// next re-run; the page reads the states again when it comes back to the front, because a re-run
// started elsewhere changes them.

const runId = '2f0c4b1e-0000-4000-8000-000000000001';
const route = `/api/runs/${runId}/answers`;
const reopenRoute = `${route}/OQ-002/reopen`;

const open = {
  cardId: 'OQ-001',
  question: 'Is a sold-out item still shown?',
  context: 'Catalog/Default.aspx.cs:41-58 The list filters on stock.',
  answer: '',
  state: 'Open',
  dependents: 0,
};
const answered = {
  cardId: 'OQ-002',
  question: 'Who may edit prices?',
  context: 'Catalog/Edit.aspx.cs:3-9 Only one role edits.',
  answer: 'Managers.',
  state: 'Answered',
  dependents: 0,
};

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

describe('reopening an answered question on the page', () => {
  it('RF-241 offers Reopen on an Answered question and on no other', async () => {
    renderAnswers({ [`GET ${route}`]: json(200, { questions: [open, answered] }) });

    await waitFor(() => {
      expect(screen.getAllByTestId('open-question')).toHaveLength(2);
    });

    expect(within(item('OQ-002')).getByRole('button', { name: 'Reopen question' })).toBeDefined();
    expect(within(item('OQ-001')).queryByRole('button', { name: 'Reopen question' })).toBeNull();
  });

  it('RF-241 reopens the question and shows it Open without a Reopen button', async () => {
    const page = renderAnswers({
      [`GET ${route}`]: json(200, { questions: [open, answered] }),
      [`POST ${reopenRoute}`]: json(200, { questions: [open, { ...answered, state: 'Open' }] }),
    });
    await screen.findByLabelText('Answer to OQ-002');

    fireEvent.click(within(item('OQ-002')).getByRole('button', { name: 'Reopen question' }));

    await waitFor(() => {
      expect(within(item('OQ-002')).getByTestId('status-badge').textContent).toContain('Answer saved');
    });
    expect(page.calls.find((call) => call.method === 'POST')).toMatchObject({
      path: reopenRoute,
      csrf: 'csrf-0',
    });
    expect(within(item('OQ-002')).queryByRole('button', { name: 'Reopen question' })).toBeNull();
    expect(within(item('OQ-002')).getByRole('status').textContent).toContain(
      'Question reopened. The next re-run with answers uses the answer.',
    );
  });

  it('RF-241 shows the code and message of a refused reopen and keeps the question Answered', async () => {
    renderAnswers({
      [`GET ${route}`]: json(200, { questions: [open, answered] }),
      [`POST ${reopenRoute}`]: failure(404, 'RST-2003'),
    });
    await screen.findByLabelText('Answer to OQ-002');

    fireEvent.click(within(item('OQ-002')).getByRole('button', { name: 'Reopen question' }));

    await waitFor(() => {
      expect(item('OQ-002').textContent).toContain('RST-2003');
    });
    expect(within(item('OQ-002')).getByTestId('status-badge').textContent).toContain('Answered');
  });
});

describe('the states of the questions after a re-run', () => {
  it('RF-241 RF-1007 reads the questions again when the page comes back to the front', async () => {
    let reads = 0;
    const questionsNow: Answer = () => {
      reads += 1;
      return json(200, { questions: [reads === 1 ? open : { ...open, state: 'Answered' }] });
    };
    renderAnswers({ [`GET ${route}`]: questionsNow });
    await waitFor(() => {
      expect(within(item('OQ-001')).getByTestId('status-badge').textContent).toContain('Open');
    });

    fireEvent(window, new Event('focus'));

    await waitFor(() => {
      expect(within(item('OQ-001')).getByTestId('status-badge').textContent).toContain('Answered');
    });
    expect(reads).toBe(2);
  });
});

describe('the states of the questions, further cases', () => {
  it('RF-241 RF-1007 reads the questions again when the page becomes visible', async () => {
    let reads = 0;
    const questionsNow: Answer = () => {
      reads += 1;
      return json(200, { questions: [open] });
    };
    renderAnswers({ [`GET ${route}`]: questionsNow });
    await waitFor(() => {
      expect(reads).toBe(1);
    });

    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() => {
      expect(reads).toBe(2);
    });
  });
});

describe('a read that is overtaken', () => {
  it('RF-241 ignores a read that started before the reopening and ends after it', async () => {
    const gate: { finish: () => void } = { finish: () => undefined };
    let reads = 0;
    const questionsNow: Answer = () => {
      reads += 1;
      if (reads === 1) return json(200, { questions: [answered] });
      const body = JSON.stringify({ questions: [answered] });
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          gate.finish = () => {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          };
        },
      });
      return new Response(stream, { headers: { 'content-type': 'application/json' } });
    };
    renderAnswers({
      [`GET ${route}`]: questionsNow,
      [`POST ${reopenRoute}`]: json(200, { questions: [{ ...answered, state: 'Open' }] }),
    });
    await screen.findByLabelText('Answer to OQ-002');
    fireEvent(window, new Event('focus'));
    await waitFor(() => {
      expect(reads).toBe(2);
    });
    fireEvent.click(within(item('OQ-002')).getByRole('button', { name: 'Reopen question' }));
    await waitFor(() => {
      expect(within(item('OQ-002')).getByTestId('status-badge').textContent).toContain('Answer saved');
    });

    gate.finish();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(within(item('OQ-002')).getByTestId('status-badge').textContent).toContain('Answer saved');
  });
});
