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
  // Polled: a stylesheet that is still arriving leaves the background transparent for a moment. A
  // transparent background is no background (NaN), so it never counts as dark or as light.
  const shown = expect.poll(
    async () => {
      const colour = await backgroundOf(page);
      return colour[3] > 0 ? luminance(colour) : Number.NaN;
    },
    { message: `an opaque ${scheme} background in the ${scheme} scheme` },
  );
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

/** The width of each table of the page and of the box it sits in, in pixels. */
const tableBoxes = z.array(z.object({ name: z.string(), width: z.number(), box: z.number() }));

// A string, because the end-to-end project is compiled without the DOM types.
const tableBoxesScript = `Array.from(document.querySelectorAll('table')).map((table) => ({
  name: table.getAttribute('aria-label') ?? table.querySelector('caption')?.textContent?.trim() ?? '(unnamed)',
  width: table.offsetWidth,
  box: table.parentElement?.clientWidth ?? 0,
}))`;

/**
 * At 360 px every table fits the box it sits in. A table wider than its box scrolls sideways inside
 * it, and the sweep fails on it: no table is exempt (RNF-010, design-system.md section 8).
 */
async function expectTablesFitTheirBox(page: Page): Promise<void> {
  const tables = tableBoxes.parse(await page.evaluate(tableBoxesScript));
  const wide = tables.filter((table) => table.width > table.box).map((table) => table.name);
  expect(wide, `${page.url()}: a table scrolls sideways at 360 px`).toEqual([]);
}

/** One cell of a stacked table: its column, its data-label and the fonts a reader sees. */
const stackedCells = z.array(
  z.object({
    table: z.string(),
    column: z.string(),
    label: z.string().nullable(),
    action: z.boolean(),
    empty: z.boolean(),
    labelFont: z.string(),
    labelWeight: z.string(),
    bodyFont: z.string(),
    bodyWeight: z.string(),
  }),
);

// A string, because the end-to-end project is compiled without the DOM types. A stacked table names
// each cell by its column (`data-label`) and shows the label in the font of the column heading. A
// cell is an action cell when it holds a button or sits in an action column: its heading cell exists
// and is empty, or reads Actions (Delete, Reset password, projects). A table without a heading cell
// for the column is a text column; a link alone does not exempt a cell, because a text column made
// of links has a heading of its own.
const stackedCellsScript = `Array.from(document.querySelectorAll('table.rst-table--stack, table.stacked'))
  .flatMap((table) => {
    const name = table.getAttribute('aria-label') ?? table.querySelector('caption')?.textContent?.trim() ?? '(unnamed)';
    const heads = table.tHead?.rows[0]?.cells ?? [];
    return Array.from(table.querySelectorAll('td')).map((cell) => {
      const head = heads[cell.cellIndex];
      const label = getComputedStyle(cell, '::before');
      const body = getComputedStyle(document.body);
      return {
        table: name,
        column: head?.textContent?.trim() ?? '',
        label: cell.getAttribute('data-label'),
        action:
          cell.querySelector('button') !== null ||
          (head !== undefined && ['', 'Actions'].includes(head.textContent?.trim() ?? '')),
        empty: cell.textContent?.trim() === '' && cell.children.length === 0,
        labelFont: label.fontFamily,
        labelWeight: label.fontWeight,
        bodyFont: body.fontFamily,
        bodyWeight: body.fontWeight,
      };
    });
  })`;

/**
 * At 360 px every cell of a stacked table that holds text is named by its column: its data-label is
 * the heading of its column, except an action cell (a button, or a cell of an action column)
 * and an empty cell, which have none. A link-only text column (Transcript, Open) is checked.
 * The label is in the page font, so a monospace cell does not make its label monospace.
 */
async function expectStackedCellsNamed(page: Page): Promise<void> {
  const cells = stackedCells.parse(await page.evaluate(stackedCellsScript));
  const unnamed = cells.filter((cell) => cell.label === null && !cell.action && !cell.empty);
  const mislabelled = cells.filter((cell) => cell.label !== null && cell.label !== cell.column);
  const fonts = cells.filter(
    (cell) =>
      cell.label !== null &&
      (cell.labelFont !== cell.bodyFont || cell.labelWeight !== cell.bodyWeight),
  );
  const describe = (list: readonly { table: string; column: string }[]): string[] =>
    list.map((cell) => `${cell.table}: ${cell.column}`);
  expect(describe(unnamed), `${page.url()}: a cell of a stacked table has no data-label`).toEqual(
    [],
  );
  expect(describe(mislabelled), `${page.url()}: a data-label is not its column heading`).toEqual(
    [],
  );
  expect(describe(fonts), `${page.url()}: a data-label is not in the body font`).toEqual([]);
}

// A string, because the end-to-end project is compiled without the DOM types. A break inside a word
// is a line break between two characters of one run of non-space characters, where the earlier one
// is not a hyphen or a slash (the browser may break after those). Each broken word is reported.
const midWordScript = `Array.from(document.querySelectorAll('table td, table th')).flatMap((cell) => {
  // A stacked table hides its heading row out of the flow (absolute, 1 px): it is not read.
  const head = cell.closest('thead');
  if (head !== null && getComputedStyle(head).position === 'absolute') return [];
  const words = [];
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (let index = 1; index < text.length; index++) {
      const before = text[index - 1];
      const after = text[index];
      if (/\\s/u.test(before) || /\\s/u.test(after) || before === '-' || before === '/') continue;
      const top = (at) => {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        return Math.round(range.getBoundingClientRect().top);
      };
      if (Math.abs(top(index - 1) - top(index)) > 2) {
        const start = text.lastIndexOf(' ', index - 1) + 1;
        const end = text.indexOf(' ', index);
        words.push(text.slice(start, end === -1 ? text.length : end));
      }
    }
  }
  return words;
})`;

/**
 * No word of a table cell breaks inside itself (RNF-010, design-system.md section 8): a word breaks
 * only at a space, a hyphen or a slash. Checked at 360 px in the report, where the cells are narrow.
 */
export async function expectNoMidWordBreak(page: Page): Promise<void> {
  const broken: unknown = await page.evaluate(midWordScript);
  expect(broken, `${page.url()}: a word of a table cell breaks inside itself`).toEqual([]);
}

/** The checks of the sweep on the page as it is now, once its colours have stopped moving. */
// RNF-010
export async function expectPageInView(page: Page, kind: PageKind = 'app'): Promise<void> {
  // The pointer may still be over the control that led here: its hover state is not the page at rest.
  await page.mouse.move(0, 0);
  // The theme is set after the first render and colours fade to it: axe waits for them (smoke.spec.ts).
  await expectSchemeFollowed(page, kind);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await expectNoSidewaysScroll(page);
  if ((page.viewportSize()?.width ?? 0) <= phoneWidth) {
    await expectTablesFitTheirBox(page);
    await expectStackedCellsNamed(page);
  }
}

/**
 * Pauses the page's CSS animations at their first frame (`'start'`), as a page just opened shows
 * them, or at the last frame of their cycle (`'end'`), where the landing page's replay shows its
 * finished state (every event in, the final badge `.swap-b` shown). The replay loops for ever and
 * fades each event in, so a check at a random moment can meet an event half-faded (contrast near
 * 1:1) that no reader ever has to read; the sweep checks both held frames instead.
 */
// RNF-010
export async function holdAnimationsAt(page: Page, frame: 'start' | 'end'): Promise<void> {
  const time = frame === 'start' ? '0' : 'Number(timing.delay) + Number(timing.duration) - 1';
  // A string, because the end-to-end project is compiled without the DOM types.
  await page.evaluate(`document.getAnimations()
    .filter((each) => each instanceof CSSAnimation)
    .forEach((each) => {
      each.pause();
      const timing = each.effect.getComputedTiming();
      each.currentTime = ${time};
    })`);
}
