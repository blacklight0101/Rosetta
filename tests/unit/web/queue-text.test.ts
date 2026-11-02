import { expect, it } from 'vitest';
import { queueText } from '../../../web/src/lib/live-run/queue-text.js';

// RF-1108, EV-80: every page says a queued run's place and how many runs are ahead of it.

it.each([
  [1, 'position 1, no run ahead'],
  [2, 'position 2, 1 run ahead'],
  [4, 'position 4, 3 runs ahead'],
])('RF-1108 EV-80 place %i reads "%s"', (position, text) => {
  expect(queueText(position)).toBe(text);
});
