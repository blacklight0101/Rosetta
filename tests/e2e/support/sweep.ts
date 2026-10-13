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
  // Polled: a stylesheet that is still arriving leaves the background transparent for a moment.
  const shown = expect.poll(async () => luminance(await backgroundOf(page)), {
    message: `a ${scheme} background in the ${scheme} scheme`,
  });
  if (scheme === 'dark') await shown.toBeLessThan(0.2);
  else await shown.toBeGreaterThan(0.5);
}

const overflowScript =
  'document.documentElement.scrollWidth - document.documentElement.clientWidth';

/** How far the page reaches beside the viewport, in pixels (0 or less: not at all). */
async function sidewaysOverflow(page: Page): Promise<number> {
  const overflow: unknown = await page.evaluate(overflowScript);
  return Number(overflow);
}

/** `scrollWidth <= clientWidth`: the page never scrolls sideways (at 360 px: the phone check). */
async function expectNoSidewaysScroll(page: Page, what = 'the page'): Promise<void> {
  expect(
    await sidewaysOverflow(page),
    `${page.url()}: ${what} scrolls sideways`,
  ).toBeLessThanOrEqual(0);
}

/**
 * A table of the desktop web UI that is known to be wider than 360 px. The orchestration README
 * (section 1) asks the 360 px width of the landing page, sign-in and report only; the table names
 * what fixes it. At 360 px the sweep measures the page with that table taken out of the layout, so
 * any other element that overflows still fails, and records the table's own overflow as an
 * annotation of the test. At 1280 px nothing is exempt.
 */
export interface KnownWideTable {
  /** The accessible name of the table (its caption or `aria-label`). */
  readonly table: string;
  readonly until: string;
}

/**
 * Takes the named table out of the layout (`display: none`) or puts it back. The table is found by
 * its `aria-label` or caption, as the accessible name the spec gives; a string, because the
 * end-to-end project is compiled without the DOM types.
 */
async function setTableHidden(page: Page, name: string, hidden: boolean): Promise<void> {
  await page.evaluate(`Array.from(document.querySelectorAll('table'))
    .filter((table) => (table.getAttribute('aria-label')
      ?? table.querySelector('caption')?.textContent?.trim()) === ${JSON.stringify(name)})
    .forEach((table) => { table.style.display = ${hidden ? "'none'" : "''"}; })`);
}

async function expectOnlyTheTableScrollsSideways(page: Page, known: KnownWideTable): Promise<void> {
  const table = page.getByRole('table', { name: known.table, exact: true });
  await expect(table, `the wide table "${known.table}" is on the page`).toHaveCount(1);
  const withTable = await sidewaysOverflow(page);
  await setTableHidden(page, known.table, true);
  try {
    await expectNoSidewaysScroll(page, `the page without the table "${known.table}"`);
  } finally {
    await setTableHidden(page, known.table, false);
  }
  test.info().annotations.push({
    type: 'known wide table',
    description: `${page.url()}: "${known.table}" by ${String(withTable)} px, until ${known.until}`,
  });
}

/** The checks of the sweep on the page as it is now, once its colours have stopped moving. */
// RNF-010
export async function expectPageInView(
  page: Page,
  kind: PageKind = 'app',
  known?: KnownWideTable,
): Promise<void> {
  // The pointer may still be over the control that led here: its hover state is not the page at rest.
  await page.mouse.move(0, 0);
  // The theme is set after the first render and colours fade to it: axe waits for them (smoke.spec.ts).
  await expectSchemeFollowed(page, kind);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  const phone = (page.viewportSize()?.width ?? 0) <= phoneWidth;
  if (known === undefined || !phone) await expectNoSidewaysScroll(page);
  else await expectOnlyTheTableScrollsSideways(page, known);
}

/**
 * Pauses the page's CSS animations at their first frame, as a page just opened shows them. The
 * landing page's replay loops for ever and fades each event in, so a check at a random moment can
 * meet an event half-faded (contrast near 1:1) that no reader ever has to read.
 */
// RNF-010
export async function holdAnimationsAtStart(page: Page): Promise<void> {
  await page.evaluate(`document.getAnimations()
    .filter((each) => each instanceof CSSAnimation)
    .forEach((each) => { each.pause(); each.currentTime = 0; })`);
}
