import type { JSX } from 'preact';
import { render, waitFor } from '@testing-library/preact';
import { useEffect, useState } from 'preact/hooks';
import { expect, it, vi } from 'vitest';
import {
  useFocusFirst,
  type FocusRequest,
} from '../../../web/src/pages/use-focus-first-question.js';
import type { AnswersLoad } from '../../../web/src/pages/use-run-answers.js';

// RF-615, DEC-154 (P3-68): the request to focus the first question without an answer waits for the
// field when it mounts later than the request, and is dropped only when there is nothing to focus.

type Rows = Extract<AnswersLoad, { readonly status: 'ready' }>['questions'];

const row = (n: number, answer = ''): Rows[number] => ({
  cardId: `OQ-${String(n).padStart(3, '0')}`,
  question: `Question number ${String(n)}?`,
  context: 'Orders/Order.cs:1-5 The code does not say.',
  answer,
  state: 'Open',
  dependents: n,
});

const open = (...numbers: readonly number[]): AnswersLoad => ({
  status: 'ready',
  questions: numbers.map((n) => row(n)),
  deepens: 1,
  isDeepen: false,
});

function LateField(props: { readonly id: string; readonly after: number }): JSX.Element | null {
  const [shown, setShown] = useState(props.after === 0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(true);
    }, props.after);
    return () => {
      clearTimeout(timer);
    };
  }, [props.after]);
  return shown ? <textarea id={props.id} /> : null;
}

function Harness(props: {
  readonly load: AnswersLoad;
  readonly request: FocusRequest;
  readonly fieldAfter: number;
}): JSX.Element {
  useFocusFirst(props.load, props.request);
  return <LateField id="answer-OQ-001" after={props.fieldAfter} />;
}

const wanted = (done: () => void): FocusRequest => ({ wanted: true, done });

it('RF-615 focuses the field and finishes the request when the field is there', async () => {
  const done = vi.fn<() => void>();
  render(<Harness load={open(1, 2)} request={wanted(done)} fieldAfter={0} />);

  await waitFor(() => {
    expect(document.activeElement?.id).toBe('answer-OQ-001');
  });
  expect(done).toHaveBeenCalledTimes(1);
});

it('RF-615 keeps the request while the field is not mounted yet, then focuses it', async () => {
  const done = vi.fn<() => void>();
  render(<Harness load={open(1, 2)} request={wanted(done)} fieldAfter={30} />);

  expect(done).not.toHaveBeenCalled();
  await waitFor(() => {
    expect(document.activeElement?.id).toBe('answer-OQ-001');
  });
  expect(done).toHaveBeenCalledTimes(1);
});

it('RF-615 finishes the request at once when no question waits for an answer', () => {
  const done = vi.fn<() => void>();
  const answered: AnswersLoad = {
    status: 'ready',
    questions: [row(1, 'Staff only.')],
    deepens: 1,
    isDeepen: false,
  };
  render(<Harness load={answered} request={wanted(done)} fieldAfter={0} />);

  expect(done).toHaveBeenCalledTimes(1);
});

it('RF-615 does nothing while the questions are loading', () => {
  const done = vi.fn<() => void>();
  render(<Harness load={{ status: 'loading' }} request={wanted(done)} fieldAfter={0} />);

  expect(done).not.toHaveBeenCalled();
  expect(document.activeElement?.id).not.toBe('answer-OQ-001');
});
