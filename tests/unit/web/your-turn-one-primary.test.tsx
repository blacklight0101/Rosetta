import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { openEnded, question, readShare } from './ended-run-helpers.js';
import { runPath, runUuid } from './live-run-helpers.js';

// RF-1021, RF-646, P8-84 (UX-24, UX-25): "Your turn" shows the journey's next step as its one primary
// button: Deepen while the run read an area of own code below the coverage bar, else Set up the plan.
// The other paths are secondary links under it, as the P8Run artboard draws them.

afterEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});

const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });
const primaries = (): string[] =>
  Array.from(turn().querySelectorAll('.rst-button--primary')).map((each) => each.textContent);
const links = (): string[] =>
  Array.from(turn().querySelectorAll('.rst-button--link')).map((each) => each.textContent);

const coverage = readShare;

const twoQuestions = [question(1), question(2)];

it('RF-1021 a run read below the bar offers Deepen this run as the one primary button and the other paths as links under it', async () => {
  await openEnded({
    judged: 'Supported',
    questions: twoQuestions,
    deepens: 0,
    extra: coverage(0.16),
  });

  await within(turn()).findByRole('heading', { name: 'Your turn: read the rest of the code' });
  expect(within(turn()).getByTestId('deepen-first').textContent).toBe(
    'The readers covered 8,702 of 52,749 tokens of your own code. A Deepen reads the 21 files never read and re-checks the 23 rejected claims. Answers you give before it are used by it.',
  );
  expect(primaries()).toEqual(['Deepen this run']);
  expect(links()).toEqual(['Answer the 2 questions first', 'Skip the Deepen and set up the plan']);
  expect(within(turn()).queryByRole('button', { name: 'Set up the plan' })).toBeNull();
});

it('RF-1021 RF-646 Skip the Deepen and set up the plan records the choice and opens Plan setup for the run', async () => {
  await openEnded({
    judged: 'Supported',
    questions: twoQuestions,
    deepens: 0,
    extra: coverage(0.16),
  });

  await within(turn()).findByRole('heading', { name: 'Your turn: read the rest of the code' });
  fireEvent.click(
    within(turn()).getByRole('button', { name: 'Skip the Deepen and set up the plan' }),
  );

  expect(window.localStorage.getItem(`rosetta.skip-deepen.${runUuid}`)).toBe('1');
  expect(window.location.pathname + window.location.search).toBe(
    `/projects/p-1/plan-setup?run=${runUuid}`,
  );
});

it('RF-1021 RF-646 Answer the questions first opens the questions and Deepen stays the next step', async () => {
  await openEnded({
    judged: 'Supported',
    questions: twoQuestions,
    deepens: 0,
    extra: coverage(0.16),
  });

  await within(turn()).findByRole('heading', { name: 'Your turn: read the rest of the code' });
  fireEvent.click(within(turn()).getByRole('button', { name: 'Answer the 2 questions first' }));

  expect(screen.getByRole('tab', { name: /Your questions/u }).getAttribute('aria-selected')).toBe(
    'true',
  );
  expect(primaries()).toEqual(['Deepen this run']);
  expect(window.localStorage.getItem(`rosetta.skip-deepen.${runUuid}`)).toBeNull();
});

it('RF-1021 a run read at the bar or above offers Set up the plan as the one primary button, with Answer and Deepen as links', async () => {
  await openEnded({
    judged: 'Supported',
    questions: twoQuestions,
    deepens: 0,
    extra: coverage(0.9),
  });

  await within(turn()).findByRole('heading', { name: 'Your turn: set up the plan' });
  expect(primaries()).toEqual(['Set up the plan']);
  expect(links()).toEqual(['Answer the 2 questions first', 'Deepen this run']);
  expect(within(turn()).queryByTestId('deepen-first')).toBeNull();
});

it('RF-1021 a run that was deepened offers Set up the plan as the one primary button, also below the bar', async () => {
  await openEnded({
    judged: 'Supported',
    questions: [question(1)],
    deepens: 1,
    extra: coverage(0.16),
  });

  await within(turn()).findByRole('heading', { name: 'Your turn: set up the plan' });
  expect(primaries()).toEqual(['Set up the plan']);
  expect(links()).toEqual(['Answer the question first', 'Deepen this run']);
});

it('RF-1021 RF-646 a run whose Deepen was skipped offers Set up the plan as the one primary button', async () => {
  window.localStorage.setItem(`rosetta.skip-deepen.${runUuid}`, '1');
  await openEnded({
    judged: 'Supported',
    questions: twoQuestions,
    deepens: 0,
    extra: coverage(0.16),
  });

  await within(turn()).findByRole('heading', { name: 'Your turn: set up the plan' });
  expect(primaries()).toEqual(['Set up the plan']);
  expect(links()).toEqual(['Answer the 2 questions first', 'Deepen this run']);
});

it('RF-1021 RF-1017 a run whose Deepen is running says so, offers no Deepen and keeps Set up the plan the one primary button', async () => {
  await openEnded({
    judged: 'Supported',
    questions: twoQuestions,
    deepens: 0,
    extra: {
      ...coverage(0.16),
      [`GET ${runPath}/answers`]: json(200, {
        questions: twoQuestions,
        deepens: 0,
        deepening: true,
      }),
    },
  });

  await within(turn()).findByTestId('deepen-running');
  await waitFor(() => {
    expect(primaries()).toEqual(['Set up the plan']);
  });
  expect(links()).toEqual(['Answer the 2 questions first']);
  expect(within(turn()).queryByRole('button', { name: 'Deepen this run' })).toBeNull();
});

it('RF-1021 a run that failed has no primary button in Your turn', async () => {
  await openEnded({ judged: 'Supported', endState: 'Failed', questions: [] });

  await waitFor(() => {
    expect(turn().textContent).toContain('This run did not finish');
  });
  expect(primaries()).toEqual([]);
});
