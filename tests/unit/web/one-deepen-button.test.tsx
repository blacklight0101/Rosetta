import { screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { openEnded, question, readShare } from './ended-run-helpers.js';

// RF-1002, RF-1015, RF-646, P8-11 (EV-90): the finished understand run page offers one Deepen button.
// The journey strip points to the Deepen of "Your turn" and does not offer a second one.

afterEach(() => {
  window.localStorage.clear();
});

it('P8-11 EV-90 shows one Deepen button on a finished run that can be deepened', async () => {
  await openEnded({
    judged: 'Supported',
    questions: [question(1)],
    deepens: 0,
    extra: readShare(0.16),
  });

  await screen.findByTestId('deepen-first');

  expect(screen.getAllByRole('button', { name: /^Deepen this run/u })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Deepen this run' })).toBeTruthy();
});
