import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { AnswersHarness } from './run-answers-harness.js';

// RF-1007, RF-647 (P8-86, UX-24): one bar under the questions that wait holds "Save answers (N)",
// which saves every changed answer in one request, and "Accept the recommended answers", which saves
// each question that waits on its recommended option, as Plan setup does.

const runId = '2f0c4b1e-0000-4000-8000-000000000001';
const route = `/api/runs/${runId}/answers`;

const choices = (cardId: string) => [
  { answer: `Yes for ${cardId}`, description: 'The usual reading.', recommended: true },
  { answer: `No for ${cardId}`, description: 'The other reading.', recommended: false },
];

const row = (cardId: string, extra: Record<string, unknown> = {}) => ({
  ...{ cardId, question: `Question ${cardId}?`, context: 'a.cs:1-2 ctx', answer: '' },
  ...{ state: 'Open', dependents: 0, options: choices(cardId), chosen: '' },
  ...extra,
});

type Row = ReturnType<typeof row>;

interface Entry {
  readonly cardId: string;
  readonly answer: string;
  readonly chosen?: number | 'typed';
}

/** The fake answers route: the list, and a save that writes every entry it is sent. */
function answersRoute(questions: readonly Row[]): Answer {
  let current = [...questions];
  return (call) => {
    if (call.method === 'GET') return json(200, { questions: current });
    const entries = (call.body as { answers: Entry[] }).answers;
    current = current.map((each) => {
      const entry = entries.find((sent) => sent.cardId === each.cardId);
      if (entry === undefined) return each;
      return { ...each, answer: entry.answer, chosen: String(entry.chosen ?? '') };
    });
    return json(200, { questions: current });
  };
}

function render(questions: readonly Row[], put?: Answer) {
  const answers = answersRoute(questions);
  return renderPage(<AnswersHarness runId={runId} ended />, {
    [`GET ${route}`]: answers,
    [`PUT ${route}`]: put ?? answers,
  });
}

interface Call {
  readonly method: string;
  readonly body?: unknown;
}

const puts = (calls: readonly Call[]): Entry[][] =>
  calls
    .filter((call) => call.method === 'PUT')
    .map((call) => (call.body as { answers: Entry[] }).answers);

const item = (cardId: string): HTMLElement => {
  const found = screen
    .getAllByTestId('open-question')
    .find((each) => each.textContent.includes(cardId));
  if (found === undefined) throw new Error(`No question ${cardId}.`);
  return found;
};

const choose = (cardId: string, option: RegExp): void => {
  fireEvent.click(within(item(cardId)).getByRole('radio', { name: option }));
};

const saveAll = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /^Save answers/u }));
};

const accept = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Accept the recommended answers' }));
};

const three = [row('OQ-001'), row('OQ-002'), row('OQ-003')];

describe('RF-1007 one bar saves the answers of the list', () => {
  it('RF-1007 shows Save answers and Accept the recommended answers under the questions that wait, and no Save per question', async () => {
    render([...three, row('OQ-004', { answer: 'Yes for OQ-004', chosen: '1' })]);
    await screen.findAllByTestId('open-question');

    const bar = screen.getByTestId('save-answers');
    const buttons = within(bar).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Save answers (0)',
      'Accept the recommended answers',
    ]);
    expect(screen.queryByRole('button', { name: 'Save answer' })).toBeNull();
    const answered = screen.getByTestId('answered-questions');
    const lastOpen = item('OQ-003');
    expect(lastOpen.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar.compareDocumentPosition(answered) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('RF-1007 starts each question that waits with no option chosen and counts the changed answers', async () => {
    render(three);
    await screen.findAllByTestId('open-question');
    const checked = screen
      .getAllByRole('radio')
      .filter((radio) => (radio as HTMLInputElement).checked);
    expect(checked).toHaveLength(0);

    choose('OQ-001', /No for OQ-001/u);
    choose('OQ-003', /Yes for OQ-003/u);

    expect(screen.getByRole('button', { name: /^Save answers/u }).textContent).toBe(
      'Save answers (2)',
    );
  });

  it('RF-1007 three changed answers are saved with one click, in one request, and move together', async () => {
    const page = render(three);
    await screen.findAllByTestId('open-question');
    choose('OQ-001', /No for OQ-001/u);
    choose('OQ-002', /Yes for OQ-002/u);
    choose('OQ-003', /No for OQ-003/u);

    saveAll();

    await waitFor(() => {
      expect(screen.getByTestId('answers-status').textContent).toBe(
        'Saved. 0 questions wait for an answer.',
      );
    });
    expect(puts(page.calls)).toEqual([
      [
        { cardId: 'OQ-001', answer: 'No for OQ-001', chosen: 2 },
        { cardId: 'OQ-002', answer: 'Yes for OQ-002', chosen: 1 },
        { cardId: 'OQ-003', answer: 'No for OQ-003', chosen: 2 },
      ],
    ]);
    const answered = screen.getByTestId('answered-questions');
    expect(answered.querySelector('summary')?.textContent).toBe('Answered (3)');
    for (const cardId of ['OQ-001', 'OQ-002', 'OQ-003']) {
      expect(within(item(cardId)).getByRole('status').textContent).toBe(
        'Answer saved in answers.md.',
      );
    }
    expect(screen.getByRole('button', { name: /^Save answers/u }).textContent).toBe(
      'Save answers (0)',
    );
  });

  it('RF-1007 the focus goes to the next question that waits after the save', async () => {
    render([...three, row('OQ-004')]);
    await screen.findAllByTestId('open-question');
    choose('OQ-001', /No for OQ-001/u);
    choose('OQ-002', /No for OQ-002/u);
    const save = screen.getByRole('button', { name: /^Save answers/u });
    save.focus();

    saveAll();

    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(item('OQ-003')).getByRole('radio', { name: /Yes for OQ-003/u }),
      );
    });
  });

  it('RF-1007 with nothing changed writes nothing and says so', async () => {
    const page = render(three);
    await screen.findAllByTestId('open-question');

    saveAll();

    await waitFor(() => {
      expect(screen.getByTestId('answers-status').textContent).toBe('No answer has changed.');
    });
    expect(puts(page.calls)).toEqual([]);
  });

  it('RF-1007 a refused save writes nothing, shows the error by the buttons and keeps the answers', async () => {
    render(three, failure(400, 'RST-2000'));
    await screen.findAllByTestId('open-question');
    choose('OQ-001', /No for OQ-001/u);
    choose('OQ-002', /No for OQ-002/u);

    saveAll();

    await waitFor(() => {
      expect(screen.getByTestId('save-answers').textContent).toContain('RST-2000');
    });
    expect(screen.queryByTestId('answered-questions')).toBeNull();
    const second = within(item('OQ-002')).getByRole('radio', { name: /No for OQ-002/u });
    expect((second as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: /^Save answers/u }).textContent).toBe(
      'Save answers (2)',
    );
  });
});

describe('RF-647 Accept the recommended answers on the Your questions tab', () => {
  it('RF-647 saves each question that waits on its recommended option, a changed one as changed, in one request', async () => {
    const saved = row('OQ-004', { answer: 'No for OQ-004', chosen: '2' });
    const page = render([...three, saved]);
    await screen.findAllByTestId('open-question');
    choose('OQ-002', /No for OQ-002/u);

    accept();

    await waitFor(() => {
      expect(puts(page.calls)).toHaveLength(1);
    });
    expect(puts(page.calls)[0]).toEqual([
      { cardId: 'OQ-001', answer: 'Yes for OQ-001', chosen: 1 },
      { cardId: 'OQ-002', answer: 'No for OQ-002', chosen: 2 },
      { cardId: 'OQ-003', answer: 'Yes for OQ-003', chosen: 1 },
    ]);
    await waitFor(() => {
      expect(screen.getByTestId('answered-questions').querySelector('summary')?.textContent).toBe(
        'Answered (4)',
      );
    });
  });

  it('RF-647 is not offered when no question with suggested answers waits', async () => {
    render([row('OQ-001', { answer: 'Yes for OQ-001', chosen: '1' })]);
    await screen.findAllByTestId('open-question');

    expect(screen.getByRole('button', { name: /^Save answers/u })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept the recommended answers' })).toBeNull();
  });
});
