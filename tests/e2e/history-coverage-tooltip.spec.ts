import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';
import { expect, test } from './support/fixtures.js';
import { openHistory, runRow, runsTable } from './support/history-page.js';
import {
  openScanRun,
  openStartPage,
  RUN_DONE,
  runStatus,
  startUnderstand,
} from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { expectPageInView } from './support/sweep.js';

// RF-231, RNF-010, design-system.md section 5.1, P8-89: the Coverage tooltip of a History row is an
// overlay. Opening it moves no cell of the table, never pushes "More actions" out of the viewport, is not
// clipped by the scrolling box of the table and adds no scrollbar, on the first row and on the last, in
// the four views (@visual); it closes with Escape on hover and stays under a diagonal move (P8-129). The
// runs are real runs of the test server; the last-row test only reverses the list, so that the row with
// measures is the last.

test.describe.configure({ mode: 'serial' });

const visual = { tag: '@visual' };

/** Where the row's cells stand and how large the table, its scrolling box and the page are. */
async function layoutOf(page: Page, row: Locator): Promise<unknown> {
  const table = runsTable(page);
  return {
    cells: await row.locator('td').evaluateAll((cells) =>
      cells.map((cell) => {
        const box = cell.getBoundingClientRect();
        return [box.x, box.y, box.width, box.height];
      }),
    ),
    costX: await row
      .locator('td[data-label="Cost"]')
      .evaluate((cell) => cell.getBoundingClientRect().x),
    tableWidth: await table.evaluate((box) => box.getBoundingClientRect().width),
    scrollBox: await table.evaluate((element) => {
      const box = element.parentElement;
      return [box?.scrollWidth, box?.scrollHeight, box?.clientWidth, box?.clientHeight];
    }),
    pageBox: await page.evaluate(() => {
      const root = document.documentElement;
      return [root.scrollWidth, root.scrollHeight, root.clientWidth, root.clientHeight];
    }),
  };
}

/** Is the box inside the viewport, and is it on top at a point just inside each corner (the radius leaves the very corner out)? */
async function readTip(tip: Locator): Promise<{ inView: boolean; shown: boolean }> {
  return tip.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const root = document.documentElement;
    const corners = [
      [box.left + 3, box.top + 3],
      [box.right - 3, box.top + 3],
      [box.left + 3, box.bottom - 3],
      [box.right - 3, box.bottom - 3],
    ] as const;
    return {
      inView:
        box.left >= 0 &&
        box.top >= 0 &&
        box.right <= root.clientWidth &&
        box.bottom <= root.clientHeight,
      shown: corners.every(([x, y]) => {
        const found = document.elementFromPoint(x, y);
        return found !== null && element.contains(found);
      }),
    };
  });
}

/** Inside the viewport and on top at its four corners: nothing clips or covers it. */
async function expectWholeTip(tip: Locator): Promise<void> {
  await expect(tip).toBeVisible();
  expect(await readTip(tip)).toEqual({ inView: true, shown: true });
}

async function expectMoreActionsInView(page: Page, row: Locator): Promise<void> {
  const button = row.getByRole('button', { name: /^More actions for run / });
  const box = await button.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? width) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
}

/**
 * The pointer can cross the gap from the value straight onto the tooltip and the tooltip stays
 * (WCAG 1.4.13, hoverable).
 */
async function movePointerOntoTip(page: Page, value: Locator, tip: Locator): Promise<void> {
  const [from, to] = [await value.boundingBox(), await tip.boundingBox()];
  if (from === null || to === null) throw new Error('The value or its tooltip has no box.');
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 12 });
  await expect(tip).toBeVisible();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await expect(tip).toBeVisible();
}

/**
 * P8-129: the pointer leaves the value through its side, outside the value and the tooltip for a moment, on
 * its way onto the tooltip (a diagonal move), and the tooltip stays (WCAG 1.4.13, hoverable).
 */
async function crossCornerOntoTip(page: Page, value: Locator, tip: Locator): Promise<void> {
  const [from, to] = [await value.boundingBox(), await tip.boundingBox()];
  if (from === null || to === null) throw new Error('The value or its tooltip has no box.');
  const below = to.y >= from.y + from.height;
  await page.mouse.move(from.x + from.width - 2, from.y + from.height / 2);
  await page.mouse.move(from.x + from.width + 6, below ? from.y + from.height - 3 : from.y + 3);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 2 });
  await page.waitForTimeout(400);
  await expect(tip).toBeVisible();
}

/** P8-129: Escape closes a tooltip that only the pointer rests on; leaving and hovering again opens it. */
async function expectEscapeOnHover(page: Page, value: Locator, tip: Locator): Promise<void> {
  await value.hover();
  await expect(tip).toBeVisible();
  await expect(value).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await page.mouse.move(0, 0);
  await value.hover();
  await expect(tip).toBeVisible();
}

/** Keyboard focus and then hover open the tooltip; neither moves anything of the table or page. */
async function expectOverlayOn(page: Page, row: Locator): Promise<void> {
  const value = row.getByTestId('run-coverage');
  const tip = row.getByRole('tooltip');
  await value.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
  const rest = await layoutOf(page, row);
  await expectMoreActionsInView(page, row);

  await value.focus();
  await expectWholeTip(tip);
  expect(await layoutOf(page, row)).toEqual(rest);
  await expectMoreActionsInView(page, row);
  await value.blur();
  await expect(tip).toBeHidden();

  await value.hover();
  await expectWholeTip(tip);
  expect(await layoutOf(page, row)).toEqual(rest);
  await expectMoreActionsInView(page, row);
  await movePointerOntoTip(page, value, tip);
  await crossCornerOntoTip(page, value, tip);
  await expectEscapeOnHover(page, value, tip);
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
  expect(await layoutOf(page, row)).toEqual(rest);
}

/**
 * With the value at the foot of the viewport the tooltip stands above it, whole, and moves nothing. The
 * pointer is moved by hand: Playwright's hover would scroll the value to the middle of the viewport first.
 */
async function expectTipAboveAtFoot(page: Page, row: Locator): Promise<void> {
  const value = row.getByTestId('run-coverage');
  const tip = row.getByRole('tooltip');
  await page.mouse.move(0, 0);
  await value.blur();
  await value.evaluate((element) => {
    const { clientHeight } = document.documentElement;
    window.scrollBy(0, element.getBoundingClientRect().bottom + 2 - clientHeight);
  });
  const rest = await layoutOf(page, row);
  const anchor = await value.boundingBox();
  const foot = page.viewportSize()?.height ?? 0;
  if (anchor === null) throw new Error('The value has no box.');
  expect(anchor.y + anchor.height).toBeCloseTo(foot - 2, 0);

  await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2);
  await expectWholeTip(tip);
  const box = await tip.boundingBox();
  expect((box?.y ?? foot) + (box?.height ?? 0)).toBeLessThanOrEqual(anchor.y);
  expect(await layoutOf(page, row)).toEqual(rest);
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
}

/** A scroll of the page leaves the open tooltip beside its value, above or below it. */
async function expectTipFollowsScroll(page: Page, value: Locator, tip: Locator): Promise<void> {
  await value.focus();
  await expect(tip).toBeVisible();
  await page.evaluate(() => {
    window.scrollBy(0, 24);
  });
  await expect
    .poll(async () => {
      const [anchor, box] = [await value.boundingBox(), await tip.boundingBox()];
      if (anchor === null || box === null) return Number.POSITIVE_INFINITY;
      const below = Math.abs(box.y - (anchor.y + anchor.height));
      const above = Math.abs(anchor.y - (box.y + box.height));
      return Math.min(below, above);
    })
    .toBeLessThanOrEqual(6);
}

const historyAnswer = z.object({ runs: z.array(z.unknown()) }).loose();

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('history', info.project.name));
});

test(
  'RNF-010 RF-231 the Coverage tooltip of a row moves nothing of the table',
  visual,
  async ({ page }) => {
    test.setTimeout(180_000);
    await openStartPage(page);
    await openScanRun(page);
    await startUnderstand(page, ['Catalog']);
    await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 60_000 });

    await openHistory(page);
    const row = runRow(page, '-understand');
    await expect(row.getByTestId('run-coverage')).toBeVisible();

    await expectOverlayOn(page, row);

    await row.getByTestId('run-coverage').focus();
    await expect(row.getByRole('tooltip')).toBeVisible();
    await expectPageInView(page);
    await expect(row.getByRole('tooltip')).toBeVisible();
  },
);

test(
  'RNF-010 RF-231 the Coverage tooltip of the last row at the foot of the viewport is whole and adds no scrollbar',
  visual,
  async ({ page }) => {
    await page.route('**/api/projects/*/history*', async (route) => {
      const response = await route.fetch();
      const answer = historyAnswer.parse(await response.json());
      await route.fulfill({ response, json: { ...answer, runs: [...answer.runs].reverse() } });
    });
    await openHistory(page);
    const row = runsTable(page).getByRole('row').last();
    const value = row.getByTestId('run-coverage');
    await expect(value).toBeVisible();
    await expect(row).toContainText('-understand');

    // The viewport ends just under the value, so there is no room below it for the tooltip.
    const foot = await value.evaluate(
      (element) => element.getBoundingClientRect().bottom + window.scrollY,
    );
    const width = page.viewportSize()?.width ?? 0;
    await page.setViewportSize({ width, height: Math.ceil(foot) + 2 });
    await value.evaluate((element) => {
      element.scrollIntoView({ block: 'end' });
    });

    await expectOverlayOn(page, row);
    await expectTipAboveAtFoot(page, row);
    await expectTipFollowsScroll(page, value, row.getByRole('tooltip'));
  },
);
