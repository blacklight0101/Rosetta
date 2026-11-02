import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { openEnded, question } from './ended-run-helpers.js';
import { runPath } from './live-run-helpers.js';

// RF-646, RF-1017, DEC-179: after an understand run that can be deepened, "Your turn" recommends Deepen
// before answering and says answers given now will be used by it; the user is asked to answer after the
// last Deepen, or at once when the user chooses not to Deepen. Answering earlier stays possible from
// the Your questions tab.

afterEach(() => {
  window.localStorage.clear();
});

const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });

it('RF-646 recommends Deepen first and says that answers given now will be used by it', async () => {
  await openEnded({ judged: 'Supported', questions: [question(1), question(2)], deepens: 0 });

  const note = await within(turn()).findByTestId('deepen-first');

  expect(note.textContent).toContain('Deepen this run first');
  expect(note.textContent).toContain('uses the answers given before it');
  expect(within(turn()).getByRole('button', { name: 'Deepen this run' }).className).toContain(
    'rst-button--primary',
  );
  expect(within(turn()).queryByRole('button', { name: /^Answer / })).toBeNull();
});

it('RF-646 asks for the answers at once when the user chooses not to Deepen', async () => {
  await openEnded({ judged: 'Supported', questions: [question(1), question(2)], deepens: 0 });
  await within(turn()).findByTestId('deepen-first');

  fireEvent.click(
    within(turn()).getByRole('button', { name: 'Do not Deepen: answer the questions now' }),
  );

  await waitFor(() => {
    expect(within(turn()).getByRole('button', { name: 'Answer 2 questions' })).toBeTruthy();
  });
  expect(within(turn()).queryByTestId('deepen-first')).toBeNull();
});

it('RF-646 asks for the answers once a Deepen has been made of the run', async () => {
  await openEnded({ judged: 'Supported', questions: [question(1)], deepens: 1 });

  await waitFor(() => {
    expect(within(turn()).getByRole('button', { name: 'Answer 1 question' })).toBeTruthy();
  });
  expect(within(turn()).queryByTestId('deepen-first')).toBeNull();
});

it('RF-646 keeps answering earlier possible from the Your questions tab', async () => {
  await openEnded({ judged: 'Supported', questions: [question(1)], deepens: 0 });
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
