import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { openEnded, question, readShare } from './ended-run-helpers.js';
import { runPath, runUuid } from './live-run-helpers.js';

// RF-646, RF-1017, DEC-179: after an understand run that can be deepened, "Your turn" recommends Deepen
// before answering and says answers given now will be used by it; the user is asked to answer after the
// last Deepen, or at once when the user chooses not to Deepen. Answering earlier stays possible from
// the Your questions tab. RF-1021 (P8-84): Deepen is the one primary button while the run read code
// below the coverage bar; the other paths are links under it.

afterEach(() => {
  window.localStorage.clear();
});

const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });

it('RF-646 recommends Deepen first and says that answers given now will be used by it', async () => {
  await openEnded({
    judged: 'Supported',
    questions: [question(1), question(2)],
    deepens: 0,
    extra: readShare(0.16),
  });

  const note = await within(turn()).findByTestId('deepen-first');

  expect(note.textContent).toContain('Answers you give before it are used by it.');
  expect(within(turn()).getByRole('button', { name: 'Deepen this run' }).className).toContain(
    'rst-button--primary',
  );
  expect(within(turn()).queryByRole('button', { name: /^Answer \d/u })).toBeNull();
});

it('RF-646 asks for the answers at once when the user chose not to Deepen', async () => {
  window.localStorage.setItem(`rosetta.skip-deepen.${runUuid}`, '1');
  await openEnded({
    judged: 'Supported',
    questions: [question(1), question(2)],
    deepens: 0,
    extra: readShare(0.16),
  });

  await waitFor(() => {
    expect(
      within(turn()).getByRole('button', { name: 'Answer the 2 questions first' }),
    ).toBeTruthy();
  });
  expect(within(turn()).queryByTestId('deepen-first')).toBeNull();
});

it('RF-646 asks for the answers once a Deepen has been made of the run', async () => {
  await openEnded({
    judged: 'Supported',
    questions: [question(1)],
    deepens: 1,
    extra: readShare(0.16),
  });

  await waitFor(() => {
    expect(within(turn()).getByRole('button', { name: 'Answer the question first' })).toBeTruthy();
  });
  expect(within(turn()).queryByTestId('deepen-first')).toBeNull();
});

it('RF-646 keeps answering earlier possible from the Your questions tab', async () => {
  await openEnded({
    judged: 'Supported',
    questions: [question(1)],
    deepens: 0,
    extra: readShare(0.16),
  });
  await within(turn()).findByTestId('deepen-first');

  fireEvent.click(screen.getByRole('tab', { name: /Your questions/u }));

  expect(await screen.findAllByTestId('open-question')).toHaveLength(1);
});

it('RF-646 P6-19 says a Deepen is running while one is, and does not say to Deepen first', async () => {
  await openEnded({
    judged: 'Supported',
    questions: [question(1), question(2)],
    deepens: 0,
    extra: {
      [`GET ${runPath}/answers`]: json(200, {
        questions: [question(1), question(2)],
        deepens: 0,
        deepening: true,
      }),
    },
  });

  const note = await within(turn()).findByTestId('deepen-running');

  expect(note.textContent).toContain('A Deepen is running');
  expect(within(turn()).queryByTestId('deepen-first')).toBeNull();
  expect(turn().textContent).not.toContain('Deepen this run first');
});
