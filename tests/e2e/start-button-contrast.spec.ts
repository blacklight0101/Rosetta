import { z } from 'zod';
import { expect, test } from './support/fixtures.js';
import { openScannedStartPage } from './support/cost-run.js';
import { accountFor } from './support/seed.js';
import { signInThroughPage } from './support/sign-in-page.js';

// RNF-010, P3-59: the contrast of the Start run button at every frame in which it can be pressed.
// The button's text turns white the moment it is enabled while its background used to fade in from
// the disabled grey, so for the length of the fade the page showed white text on a pale button
// (contrast 1.16, seen by axe in the zip journey of CI run 39384719621). A moving colour is judged
// frame by frame, not once the page has settled, so this reads every frame from the click that
// enables the button to a little after it.

const ENOUGH = 4.5;
const FRAMES_AFTER_ENABLED = 40;

/**
 * Resolves, in the page, with the lowest contrast between the text and the background of the Start
 * run button over the frames in which it is enabled; -1 when it never was.
 */
const lowestContrastScript = `new Promise((resolve) => {
  const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const channels = (css) => {
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = css;
    canvas.fillRect(0, 0, 1, 1);
    return Array.from(canvas.getImageData(0, 0, 1, 1).data).slice(0, 3).map((value) => {
      const unit = value / 255;
      return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = (css) => {
    const [r, g, b] = channels(css);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  let lowest = Infinity;
  let sampled = 0;
  const started = performance.now();
  const frame = () => {
    const button = Array.from(document.querySelectorAll('button')).find((each) =>
      (each.textContent ?? '').startsWith('Start run'),
    );
    if (button !== undefined && !button.disabled) {
      const style = getComputedStyle(button);
      const [light, dark] = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
      lowest = Math.min(lowest, (light + 0.05) / (dark + 0.05));
      sampled += 1;
    }
    if (sampled >= ${String(FRAMES_AFTER_ENABLED)}) resolve(lowest);
    else if (performance.now() - started > 20000) resolve(-1);
    else requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})`;

test('RNF-010 the Start run button keeps readable text on every frame while it becomes enabled', async ({
  page,
}, info) => {
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await openScannedStartPage(page);
  const start = page.getByRole('button', { name: /^Start run/u });
  // A page that has just loaded waits for its estimate with Start disabled; the answer is held back.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/projects/*/estimate*', async (route) => {
    await held;
    await route.continue();
  });
  await page.reload();
  await expect(start).toBeDisabled();

  const sampling = page.evaluate(lowestContrastScript);
  release();
  await expect(start).toBeEnabled();

  expect(z.number().parse(await sampling)).toBeGreaterThanOrEqual(ENOUGH);
});
