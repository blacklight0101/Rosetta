import { test, type Page } from '@playwright/test';
import { z } from 'zod';
import { expect } from './fixtures.js';
import { checksEveryView, inEveryView } from './views.js';

// RNF-010, design-system.md section 8: a keyboard-only walk of a page. Every control the page offers
// (links, buttons, fields, summaries) must be reached by pressing Tab and show a focus indicator (an
// outline or a shadow) inside the window when it has focus. The scripts are evaluated as strings
// because the end-to-end project is compiled without the DOM types.

const CONTROLS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

const focused = z.object({
  mark: z.string().nullable(),
  outlined: z.boolean(),
  inView: z.boolean(),
});

const MARK = `
  (() => {
    const controls = [...document.querySelectorAll(${JSON.stringify(CONTROLS)})].filter(
      (control) => control.checkVisibility() && getComputedStyle(control).visibility !== 'hidden',
    );
    controls.forEach((control, index) => control.setAttribute('data-walk', String(index)));
    return controls.length;
  })()
`;

const FOCUSED = `
  (() => {
    const control = document.activeElement;
    const style = control ? getComputedStyle(control) : undefined;
    const outlined = style
      ? (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none'
      : false;
    const box = control ? control.getBoundingClientRect() : undefined;
    const inView = box ? box.bottom > 0 && box.top < window.innerHeight : false;
    return { mark: control ? control.getAttribute('data-walk') : null, outlined, inView };
  })()
`;

interface Walk {
  /** How many controls the page has. */
  readonly controls: number;
  /** The controls reached, by their position in the page. */
  readonly reached: readonly number[];
  /** The controls that showed no focus indicator, or were out of the window, when they had focus. */
  readonly unmarked: readonly number[];
}

/** Presses Tab from the top of the page once per control, plus a few spare presses. */
// RNF-010
async function walkWithKeyboard(page: Page): Promise<Walk> {
  const controls = z.number().parse(await page.evaluate(MARK));
  await page.evaluate(
    'document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0)',
  );
  const reached = new Set<number>();
  const unmarked = new Set<number>();
  for (let press = 0; press < controls + 5; press += 1) {
    await page.keyboard.press('Tab');
    const now = focused.parse(await page.evaluate(FOCUSED));
    if (now.mark === null) continue;
    const index = Number(now.mark);
    reached.add(index);
    if (!now.outlined || !now.inView) unmarked.add(index);
  }
  return {
    controls,
    reached: [...reached].sort((left, right) => left - right),
    unmarked: [...unmarked].sort((left, right) => left - right),
  };
}

/** Fails, naming the controls, unless the walk reached every control and each showed focus. */
async function expectEveryControlReachable(page: Page): Promise<void> {
  const walk = await walkWithKeyboard(page);
  expect(walk.controls).toBeGreaterThan(0);
  expect(walk.reached).toEqual(Array.from({ length: walk.controls }, (_, index) => index));
  expect(walk.unmarked).toEqual([]);
}

/**
 * The walk on the page as it is now. A behavioural test repeats it in the four views (1280 and
 * 360 px, light and dark), like the axe check; any other test makes it once.
 */
// RNF-010
export async function expectKeyboardWalk(page: Page): Promise<void> {
  const info = test.info();
  if (!checksEveryView(info)) {
    await expectEveryControlReachable(page);
    return;
  }
  await inEveryView(page, info, () => expectEveryControlReachable(page));
}
