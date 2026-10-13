import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { renderReplayHtml } from '../../../../src/infrastructure/report/replay-html.js';
import { plainReplay, reportModel } from '../../../support/report-fixtures.js';

// RF-506: the replay script shows the steps one by one with play, pause, step and restart. It runs
// here in happy-dom against the page the writer produces; the end-to-end spec runs it in a browser.

const script = await readFile(
  fileURLToPath(new URL('../../../../templates/report/replay.js', import.meta.url)),
  'utf8',
);

function pageOf(interval = '1'): Window {
  const window = new Window({ settings: { disableJavaScriptEvaluation: false } });
  const html = renderReplayHtml(reportModel({ replay: plainReplay() })).replace(
    'data-replay-steps ',
    `data-replay-steps data-interval="${interval}" `,
  );
  window.document.write(html);
  window.eval(script);
  return window;
}

const itemsOf = (window: Window) => [
  ...window.document.querySelectorAll('ol[data-replay-steps] > li'),
];
const visible = (window: Window): number =>
  itemsOf(window).filter((item) => !item.hasAttribute('hidden')).length;
const press = (window: Window, action: string): void => {
  const button = window.document.querySelector(`[data-action="${action}"]`);
  if (button === null) throw new Error(`No ${action} button`);
  button.dispatchEvent(new window.Event('click', { bubbles: true }));
};
const statusOf = (window: Window): string =>
  window.document.querySelector('[data-replay-status]')?.textContent ?? '';

describe('the replay script', () => {
  it('RF-506 reveals the controls and keeps every step visible until the reader plays', () => {
    const window = pageOf();

    expect(window.document.querySelector('[data-replay-controls]')?.hasAttribute('hidden')).toBe(
      false,
    );
    expect(visible(window)).toBe(3);
    expect(statusOf(window)).toBe('Showing 3 of 3 steps, cost $0.0015');
  });

  it('RF-506 restarts from the first step and shows the next one at each step press', () => {
    const window = pageOf();

    press(window, 'restart');
    expect(visible(window)).toBe(0);
    expect(statusOf(window)).toBe('Showing 0 of 3 steps');
    press(window, 'step');
    expect(visible(window)).toBe(1);
    press(window, 'step');
    expect(visible(window)).toBe(2);
    expect(statusOf(window)).toBe('Showing 2 of 3 steps, cost $0.0010');
    expect(itemsOf(window)[1]?.getAttribute('aria-current')).toBe('step');
    expect(itemsOf(window)[0]?.hasAttribute('aria-current')).toBe(false);
  });
});

describe('the replay script playing', () => {
  it('RF-506 plays to the end by itself and stops there', async () => {
    const window = pageOf();

    press(window, 'restart');
    press(window, 'play');
    await delay(60);

    expect(visible(window)).toBe(3);
    expect(statusOf(window)).toContain('Showing 3 of 3 steps');
  });

  it('RF-506 pauses where it is', async () => {
    const window = pageOf('30');

    press(window, 'restart');
    press(window, 'play');
    await delay(45);
    press(window, 'pause');
    const paused = visible(window);
    await delay(80);

    expect(paused).toBeGreaterThanOrEqual(1);
    expect(paused).toBeLessThan(3);
    expect(visible(window)).toBe(paused);
  });

  it('RF-506 plays again from the start once it has reached the end', async () => {
    const window = pageOf();

    press(window, 'play');
    expect(visible(window)).toBeLessThanOrEqual(1);
    await delay(60);

    expect(visible(window)).toBe(3);
  });

  it('RF-507 builds nothing from markup: it only toggles attributes and sets text', () => {
    expect(script).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/u,
    );
  });
});
