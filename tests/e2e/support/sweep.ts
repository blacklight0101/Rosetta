import type { Page } from '@playwright/test';
import { z } from 'zod';
import { expectNoSeriousViolations } from './axe.js';
import { expect, test } from './fixtures.js';
import { transitionsDone } from './transitions.js';

// RNF-010, architecture.md section 17: the checks of the visual sweep (tests/e2e/visual/), made on
// each page in the view of the Playwright project (tagged @visual, so all four run it): the page
// follows the project's colour scheme, axe finds no serious or critical violation (colour contrast
// among them) and nothing of the page lies beside the viewport, which at 360 px is the phone check.

/** A page drawn by the front end sets `data-theme`; a static page (landing, report) does not. */
export type PageKind = 'app' | 'static';

const phoneWidth = 360;

const rgb = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** The background the page shows: the body's, or the root's when the body has none. */
async function backgroundOf(page: Page): Promise<z.output<typeof rgb>> {
  // A string, because the end-to-end project is compiled without the DOM types.
  const value: unknown = await page.evaluate(`(() => {
    const parse = (colour) => (colour.match(/[\\d.]+/g) ?? []).map(Number);
    const [body, root] = [document.body, document.documentElement].map(
      (element) => parse(getComputedStyle(element).backgroundColor),
    );
    const shown = (channels) => channels.length === 3 || (channels.length === 4 && channels[3] > 0);
    const chosen = shown(body) ? body : root;
    return [chosen[0] ?? 0, chosen[1] ?? 0, chosen[2] ?? 0, chosen.length === 4 ? chosen[3] : 1];
  })()`);
  return rgb.parse(value);
}

/** WCAG relative luminance of an sRGB colour, 0 for black and 1 for white. */
function luminance([red, green, blue]: readonly number[]): number {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red ?? 0) + 0.7152 * linear(green ?? 0) + 0.0722 * linear(blue ?? 0);
}

/** The page shows the colour scheme of the project: a dark background in dark, a light one in light. */
async function expectSchemeFollowed(page: Page, kind: PageKind): Promise<void> {
  const scheme = test.info().project.use.colorScheme === 'dark' ? 'dark' : 'light';
  if (kind === 'app') await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
  const shown = luminance(await backgroundOf(page));
  if (scheme === 'dark') expect(shown, 'a dark background in the dark scheme').toBeLessThan(0.2);
  else expect(shown, 'a light background in the light scheme').toBeGreaterThan(0.5);
}

/** `scrollWidth <= clientWidth`: the page never scrolls sideways (at 360 px: RNF-010 on a phone). */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow: unknown = await page.evaluate(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(Number(overflow), `${page.url()} scrolls sideways`).toBeLessThanOrEqual(0);
}

/**
 * A page of the desktop web UI that is known to scroll sideways at 360 px. RNF-010 asks the phone
 * width of the landing page, sign-in and report only; such a page names what fixes it, and at 360 px
 * the sweep records its overflow as an annotation of the test instead of failing (at 1280 it fails).
 */
export interface KnownOverflow {
  readonly scrollsSidewaysUntil: string;
}

async function recordOverflow(page: Page, known: KnownOverflow): Promise<void> {
  const overflow: unknown = await page.evaluate(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  test.info().annotations.push({
    type: 'known sideways scroll',
    description: `${page.url()} by ${String(overflow)} px, until ${known.scrollsSidewaysUntil}`,
  });
}

/** The checks of the sweep on the page as it is now, once its colours have stopped moving. */
// RNF-010
export async function expectPageInView(
  page: Page,
  kind: PageKind = 'app',
  known?: KnownOverflow,
): Promise<void> {
  // The pointer may still be over the control that led here: its hover state is not the page at rest.
  await page.mouse.move(0, 0);
  // The theme is set after the first render and colours fade to it: axe waits for them (smoke.spec.ts).
  await expectSchemeFollowed(page, kind);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  const phone = (page.viewportSize()?.width ?? 0) <= phoneWidth;
  if (known === undefined || !phone) await expectNoSidewaysScroll(page);
  else await recordOverflow(page, known);
}
