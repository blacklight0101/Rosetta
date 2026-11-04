import type { Locator, Page, TestInfo } from '@playwright/test';
import { z } from 'zod';
import { expect, test } from './support/fixtures.js';
import { openScannedStartPage } from './support/cost-run.js';
import { openRunTab, runStatus, startUnderstand } from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-1003, RF-1010, P8-101 (UX-18): the header during a run. At 1280 px and 1024 px the wordmark, the
// "This run" meter, the totals, the user, Sign out and the theme toggle share one line; at 390 px
// the header may wrap but the account links stay together. The runs are real runs of the test server
// (the model double replays the recorded understand run); this account is the one of
// live-run-controls.spec.ts, and a run at a time.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('live-controls', info.project.name));
});

const headerShapeSchema = z.object({
  /** Vertical spread of the centres of the parts of the header that share the first row, in px. */
  spread: z.number(),
  /** Texts or controls that break over two lines. */
  broken: z.array(z.string()),
  /** Vertical spread of the user's name, role, Sign out and the theme toggle. */
  accountSpread: z.number(),
  sideways: z.boolean(),
  /** The width of each part of the header, for the message of a failure. */
  widths: z.array(z.string()),
  /** True when the run meter is on a row of its own under the wordmark. */
  meterBelow: z.boolean(),
});
type HeaderShape = z.infer<typeof headerShapeSchema>;

/** What the header looks like now, read in the page (a string, as the project has no DOM types). */
async function headerShape(page: Page): Promise<HeaderShape> {
  const shape: unknown = await page.evaluate(`(() => {
    const header = document.querySelector('header.rst-header');
    const leaves = (root) => Array.from(root.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && el.getBoundingClientRect().width > 0 && !el.hasAttribute('hidden'));
    const centres = (list) => list.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    const spread = (list) => { const c = centres(list); return c.length === 0 ? 0 : Math.max(...c) - Math.min(...c); };
    const meter = header.querySelector('[data-testid="topbar-run-meter"]');
    const wordmark = header.querySelector('.rst-wordmark');
    const all = leaves(header);
    const below = meter.getBoundingClientRect().top >= wordmark.getBoundingClientRect().bottom;
    const row = Array.from(header.children).filter((el) => el.getBoundingClientRect().width > 0 && !(below && el === meter));
    const account = [...leaves(header.querySelector('[data-testid="header-user"]')), ...leaves(header.lastElementChild)];
    const lines = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top / 4))).size;
    };
    const broken = all.filter((el) => (el.textContent || '').trim() !== '' && lines(el) > 1)
      .map((el) => (el.textContent || '').trim());
    return {
      spread: spread(row), broken, accountSpread: spread(account),
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      meterBelow: below,
      widths: Array.from(header.children).map((el) => (el.className || el.tagName) + ' ' + Math.round(el.getBoundingClientRect().width) + ' ' + Math.round(el.getBoundingClientRect().top)),
    };
  })()`);
  return headerShapeSchema.parse(shape);
}

/** Where an element is in the viewport. */
async function boxOf(locator: Locator): Promise<{ y: number; height: number }> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { y: rect.y, height: rect.height };
  });
}

// A line holds centres a few pixels apart (a bar, a badge and text of different heights).
const ONE_LINE = 8;

/** Sets the width, shows the top of the page and reads the header and attaches the screenshot. */
async function shapeAt(page: Page, info: TestInfo, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await expect(page.getByTestId('topbar-run-meter')).toBeVisible();
  await page.evaluate('window.scrollTo(0, 0)');
  const shape = await headerShape(page);
  info.annotations.push({
    type: `header ${String(width)} px`,
    description: shape.widths.join(' | '),
  });
  await info.attach(`run-page-${String(width)}`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(shape.broken, `${String(width)} px: texts broken ${shape.widths.join(' | ')}`).toEqual([]);
  expect(shape.sideways, `${String(width)} px: no sideways scroll`).toBe(false);
  return shape;
}

/** RF-1010: the figures of the totals and their split stand one above the other. */
async function expectTotalsStacked(page: Page, width: number): Promise<void> {
  const own = await boxOf(page.locator('.rst-header__totals .rst-p136-pill__own'));
  const split = await boxOf(page.locator('.rst-header__totals .rst-p136-pill__split'));
  expect(split.y, `${String(width)} px: the split under the total figures`).toBeGreaterThanOrEqual(
    own.y + own.height - 1,
  );
}

test('RF-1003 RF-1010 P8-101 the header stays one line with the run meter at 1280 px and 1024 px and keeps the account links together at 390 px', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await openScannedStartPage(page);
  await startUnderstand(page, ['Catalog', 'Controllers']);
  await openRunTab(page, 'All agents');
  const meter = page.getByTestId('topbar-run-meter');
  await expect(meter).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('header-totals')).toBeVisible();

  // 1280 px: the whole header is one line. 1024 px: the meter has a line of its own under the
  // wordmark, and every other part of the header, the account links included, shares the first.
  for (const width of [1280, 1024]) {
    const shape = await shapeAt(page, info, width, 800);
    expect(shape.spread, `${String(width)} px: the header line`).toBeLessThanOrEqual(ONE_LINE);
    expect(shape.accountSpread, `${String(width)} px: the account links`).toBeLessThanOrEqual(
      ONE_LINE,
    );
    expect(shape.meterBelow, `${String(width)} px: the meter under the wordmark`).toBe(
      width === 1024,
    );
    await expectTotalsStacked(page, width);
  }

  const phone = await shapeAt(page, info, 390, 780);
  expect(
    phone.accountSpread,
    '390 px: name, role, Sign out and theme stay together',
  ).toBeLessThanOrEqual(ONE_LINE);

  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Stopped by you', { timeout: 30_000 });
  await expect(meter).toHaveCount(0);
});
