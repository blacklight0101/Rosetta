import { fireEvent, screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { ev, startedData } from './live-run-fixtures.js';
import { renderLive } from './live-run-helpers.js';
import { tab } from './live-run-running-helpers.js';

// RF-1003, RF-1015, P7-27: the link "Cost per role and estimate" of the spend panel selects the All
// agents tab of the run details and scrolls the run details into view, so the click is seen.

const scrolled: Element[] = [];

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  scrolled.length = 0;
});

it('RF-1003 the cost link selects the All agents tab and scrolls the run details into view', async () => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value(this: Element): void {
      scrolled.push(this);
    },
  });
  const { stream } = renderLive();
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));

  fireEvent.click(await screen.findByRole('button', { name: 'Cost per role and estimate' }));

  expect(tab('All agents').getAttribute('aria-selected')).toBe('true');
  expect(tab('Cards so far').getAttribute('aria-selected')).toBe('false');
  expect(scrolled.some((element) => element.getAttribute('aria-label') === 'Run details')).toBe(
    true,
  );
});
