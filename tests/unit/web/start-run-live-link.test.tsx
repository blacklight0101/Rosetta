import { fireEvent, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { runAnswer, runsPath } from './start-run-fixtures.js';
import { ready, renderStart, start } from './start-run-helpers.js';

// RF-1002, RF-1108, P1-35: the notice that follows Start links to the live page of the run, by the
// run's id (the UUID the stop and event routes take), whether the run began or waits in the queue.

it('RF-1002 the notice of a run that began links to its live page', async () => {
  renderStart({ [`POST ${runsPath}`]: runAnswer('understand', null) });
  await ready();

  fireEvent.click(start());

  const notice = await screen.findByTestId('run-notice');
  const link = Array.from(notice.querySelectorAll('a')).find((each) =>
    /live run/iu.test(each.textContent),
  );
  expect(link?.getAttribute('href')).toBe('/runs/r-1');
});

it('RF-1108 the notice of a queued run links to its live page too', async () => {
  renderStart({ [`POST ${runsPath}`]: runAnswer('understand', 2) });
  await ready();

  fireEvent.click(start());

  const notice = await screen.findByTestId('run-notice');
  const link = Array.from(notice.querySelectorAll('a')).find((each) =>
    /live run/iu.test(each.textContent),
  );
  expect(link?.getAttribute('href')).toBe('/runs/r-1');
  expect(notice.textContent).toContain('Queued');
});
