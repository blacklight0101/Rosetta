import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { json, type Answer } from './fake-api.js';
import { savedBrief } from './plan-setup-fixtures.js';
import { base, ready, renderPlan } from './plan-setup-helpers.js';

// RF-647, RF-645, RF-615, DEC-204: the open questions of the run and the Plan setup questions on one
// screen, each on its recommended answer; one click saves the answers and the brief and the plan
// waits for "Start the plan".

const route = '/api/runs/run-1/answers';

const choices = (recommended: string, other: string) => [
  { answer: recommended, description: 'The usual reading.', recommended: true },
  { answer: other, description: 'The other reading.', recommended: false },
  { answer: 'Neither', description: 'Say something else.', recommended: false },
];

const question = (cardId: string, extra: Record<string, unknown> = {}) => ({
  cardId,
  question: `Question ${cardId}?`,
  context: 'Catalog/Default.aspx.cs:41 filters.',
  answer: '',
  state: 'Open',
  dependents: 0,
  options: choices(`Yes for ${cardId}`, `No for ${cardId}`),
  chosen: '',
  ...extra,
});

type Row = ReturnType<typeof question>;

const three = [question('OQ-001'), question('OQ-002'), question('OQ-003')];

interface Entry {
  readonly cardId: string;
  readonly answer: string;
  readonly chosen?: number;
}

/** The fake answers route: the list, and a save that returns the list with the answer written. */
function answersRoute(questions: readonly Row[]): Answer {
  let current = [...questions];
  return (call) => {
    if (call.method === 'GET') return json(200, { questions: current });
    const entry = (call.body as { answers: Entry[] }).answers[0];
    current = current.map((each) =>
      each.cardId === entry?.cardId
        ? { ...each, answer: entry.answer, chosen: String(entry.chosen ?? '') }
        : each,
    );
    return json(200, { questions: current });
  };
}

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}

const answerPuts = (calls: readonly Call[]): unknown[] =>
  calls
    .filter((call) => call.method === 'PUT' && call.path === route)
    .map((call) => (call.body as { answers: unknown[] }).answers[0]);

const briefSaved = (calls: readonly Call[]): boolean =>
  calls.some((call) => call.method === 'PUT' && call.path === `${base}/planning-brief`);

function render(questions: readonly Row[] = three) {
  const route$ = answersRoute(questions);
  return renderPlan({ [`GET ${route}`]: route$, [`PUT ${route}`]: route$ });
}

const screenOf = (): HTMLElement =>
  screen.getByRole('region', { name: 'Questions and plan setup' });

const accept = (): void => {
  fireEvent.click(
    within(screenOf()).getByRole('button', { name: 'Accept the recommended answers' }),
  );
};

describe('the questions and the plan setup on one screen', () => {
  it('RF-647 lists the open questions with the recommended answer chosen and marked', async () => {
    render();
    await ready();

    const items = await within(screenOf()).findAllByTestId('open-question');
    expect(items).toHaveLength(3);
    for (const item of items) {
      const checked = within(item)
        .getAllByRole('radio')
        .filter((radio) => (radio as HTMLInputElement).checked);
      expect(checked).toHaveLength(1);
      expect(checked[0]?.closest('.rst-plan-opt')?.textContent).toContain('(Recommended)');
    }
  });

  it('RF-647 holds the Plan setup answers on their recommended values beside the questions', async () => {
    render();
    await ready();

    const recorded = within(screenOf()).getByRole('region', { name: 'What I recorded' });
    expect(within(recorded).getAllByText('(default)').length).toBeGreaterThan(0);
    expect(within(screenOf()).getByText(/Every question below/u)).not.toBeNull();
  });
});

describe('one click on the questions screen', () => {
  it('RF-647 one click saves every question and the brief; the plan waits for Start the plan', async () => {
    const page = render();
    await ready();
    await within(screenOf()).findAllByTestId('open-question');

    accept();

    await waitFor(() => {
      expect(briefSaved(page.calls)).toBe(true);
    });
    expect(answerPuts(page.calls)).toEqual([
      expect.objectContaining({ cardId: 'OQ-001', answer: 'Yes for OQ-001', chosen: 1 }),
      expect.objectContaining({ cardId: 'OQ-002', answer: 'Yes for OQ-002', chosen: 1 }),
      expect.objectContaining({ cardId: 'OQ-003', answer: 'Yes for OQ-003', chosen: 1 }),
    ]);
    await screen.findByRole('button', { name: 'Start the plan' });
    expect(page.calls.some((call) => call.method === 'POST' && call.path.includes('/runs'))).toBe(
      false,
    );
  });

  it('RF-647 a changed answer is kept, not replaced by the recommended one', async () => {
    const page = render();
    await ready();
    const items = await within(screenOf()).findAllByTestId('open-question');
    const second = items[1];
    if (second === undefined) throw new Error('No second question.');
    fireEvent.click(within(second).getByRole('radio', { name: /No for OQ-002/u }));

    accept();

    await waitFor(() => {
      expect(answerPuts(page.calls)).toHaveLength(3);
    });
    expect(answerPuts(page.calls)[1]).toMatchObject({
      cardId: 'OQ-002',
      answer: 'No for OQ-002',
      chosen: 2,
    });
  });
});

describe('what one click keeps', () => {
  it('RF-647 an answer saved earlier is not written again', async () => {
    const page = render([
      question('OQ-001', { answer: 'Yes for OQ-001', chosen: '1' }),
      question('OQ-002'),
    ]);
    await ready();
    await within(screenOf()).findAllByTestId('open-question');

    accept();

    await waitFor(() => {
      expect(briefSaved(page.calls)).toBe(true);
    });
    expect(answerPuts(page.calls)).toEqual([expect.objectContaining({ cardId: 'OQ-002' })]);
  });
});

describe('accepting with nothing to answer, and the button name', () => {
  it('RF-647 a run with no open questions still accepts the plan setup in one click', async () => {
    const page = renderPlan();
    await ready();

    accept();

    await waitFor(() => {
      expect(briefSaved(page.calls)).toBe(true);
    });
    expect(answerPuts(page.calls)).toEqual([]);
  });

  it('RF-647 the button that begins the plan is named Start the plan', async () => {
    renderPlan({ [`GET ${base}/planning-brief`]: json(200, savedBrief) });
    await ready();

    expect(screen.getByRole('button', { name: 'Start the plan' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Write the package/u })).toBeNull();
  });
});
