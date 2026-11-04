import type { Page, TestInfo } from '@playwright/test';
import { z } from 'zod';
import { expect, test } from './support/fixtures.js';
import { openScannedStartPage } from './support/cost-run.js';
import { boxOf, headerShape, lengthenMeter, type HeaderShape } from './support/header-shape.js';
import { openRunTab, runStatus, startUnderstand } from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-1003, RF-1010, P8-101 (UX-18): the header during a run. At 1280 px the wordmark, the "This run"
// meter, the totals, the user, Sign out and the theme toggle share one line; at 1024 px the meter has
// a line under the wordmark; on a phone the header wraps. A long name is cut with an ellipsis and
// never moves Sign out or the theme toggle. The runs are real runs of the test server (the model
// double replays the recorded understand run); the account is the one of live-run-controls.spec.ts.
// The tests run in the four views (@visual): the widths are set by the tests themselves.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('live-controls', info.project.name));
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

/** A line holds centres a few pixels apart (a bar, a badge and text of different heights). */
const ONE_LINE = 8;
/** The header with the pill on one line, as before P8-101 (66.3 px), and no more. */
const ONE_LINE_HEIGHT = 68;
const LONG_NAME = 'Maria Fernandez-Rodriguez de la Torre y Villanueva '.repeat(4).slice(0, 200);
const MEDIUM_NAME = 'Fernandez Rodriguez';
const WIDE_NAME = 'W'.repeat(200);

const sessionBody = z.object({ user: z.object({}).loose() }).loose();
const totalsBody = z.object({ totals: z.object({}).loose() }).loose();

/** What the server is made to say about the signed-in user, and what the test reads next. */
interface Account {
  displayName?: string | undefined;
  administrator: boolean;
  /** The largest totals the header can show, or ordinary ones (millions of tokens, hundreds of dollars). */
  largestTotals: boolean;
}
const account: Account = { administrator: false, largestTotals: true };

const LARGEST = {
  input: 999_999_999,
  output: 99_999_999,
  cached: 999_999_999,
  micros: '9999990000',
};
const ORDINARY = { input: 1_234_567, output: 234_567, cached: 345_678, micros: '123450000' };

/** Answers the session and the totals as the account says, over the real answers. */
async function actAs(page: Page): Promise<void> {
  // The runners' fonts differ (system-ui is Segoe UI on Windows, wider fonts on Linux): the header
  // is read with the letters 10% wider than the font draws them, so it holds with room to spare.
  await page.addInitScript(`document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = 'header.rst-header { letter-spacing: 0.1em; }';
    document.head.append(style);
  });`);
  await page.route('**/api/session', async (route) => {
    const response = await route.fetch();
    if (route.request().method() !== 'GET') return route.fulfill({ response });
    const body = sessionBody.parse(await response.json());
    const user = {
      ...body.user,
      ...(account.displayName === undefined ? {} : { displayName: account.displayName }),
      ...(account.administrator ? { role: 'admin' } : {}),
    };
    return route.fulfill({ response, json: { ...body, user } });
  });
  await page.route('**/api/account/totals', async (route) => {
    const response = await route.fetch();
    const body = totalsBody.parse(await response.json());
    const figures = account.largestTotals ? LARGEST : ORDINARY;
    const large = {
      ...body.totals,
      inputTokens: figures.input,
      outputTokens: figures.output,
      cachedInputTokens: figures.cached,
      cost: [{ currency: 'USD', costMicros: figures.micros }],
    };
    const server = {
      caps: { runMicros: '4000000', userDayMicros: '4000000', serverMonthMicros: '10000000' },
      serverMonthToDate: [{ currency: 'USD', costMicros: '8500000' }],
    };
    return route.fulfill({
      response,
      json: { ...body, totals: large, server: account.administrator ? server : null },
    });
  });
}

/** Sets the width, shows the top of the page, reads the header and attaches its screenshot. */
async function shapeAt(page: Page, info: TestInfo, width: number, label: string) {
  await page.setViewportSize({ width, height: width >= 1024 ? 800 : 780 });
  await page.evaluate('window.scrollTo(0, 0)');
  const shape = await headerShape(page);
  info.annotations.push({
    type: `${label} ${String(width)} px`,
    description: shape.widths.join(' | '),
  });
  await info.attach(`${label}-${String(width)}`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const at = `${label} ${String(width)} px`;
  expect(shape.sideways, `${at}: no sideways scroll`).toBe(false);
  expect(shape.accountOutside, `${at}: the account group inside the window`).toBe(false);
  expect(shape.accountRigid, `${at}: Sign out and the toggle can neither wrap nor shrink`).toBe(
    true,
  );
  expect(shape.accountBroken, `${at}: Sign out and the theme toggle whole`).toEqual([]);
  return { shape, at };
}

/** From 1024 px nothing of the header breaks over two lines; from 1280 px it is one line. */
function expectLine(shape: HeaderShape, at: string, width: number): void {
  expect(shape.broken, `${at}: texts broken ${shape.widths.join(' | ')}`).toEqual([]);
  expect(shape.spread, `${at}: the header line`).toBeLessThanOrEqual(ONE_LINE);
  expect(shape.accountSpread, `${at}: the account links`).toBeLessThanOrEqual(ONE_LINE);
  expect(shape.meterBelow, `${at}: the meter under the wordmark`).toBe(width < 1280);
  expect(shape.meterAfterWordmark, `${at}: the meter after the wordmark`).toBe(width >= 1280);
}

/** RF-1010: the figures and the split of the pill stand on one line when no run is active. */
async function expectPillOnOneLine(page: Page, at: string): Promise<void> {
  const own = await boxOf(page.locator('.rst-header__totals .rst-p136-pill__own'));
  const split = await boxOf(page.locator('.rst-header__totals .rst-p136-pill__split'));
  expect(Math.abs(split.y - own.y), `${at}: the split beside the figures`).toBeLessThan(own.height);
}

/**
 * RF-1010: with no run the header is one line however large the totals (the test makes them the
 * largest): 1280 px and wider holds the split in the pill, 1024 px has it as the tooltip only, and
 * the server figure stays out of the header below 1600 px.
 */
async function expectHeaderWithoutRun(
  page: Page,
  info: TestInfo,
  widths: readonly number[],
): Promise<void> {
  for (const width of widths) {
    const { shape, at } = await shapeAt(page, info, width, 'no run');
    expect(shape.height, `${at}: the header height`).toBeLessThanOrEqual(ONE_LINE_HEIGHT);
    expect(shape.spread, `${at}: the header line`).toBeLessThanOrEqual(ONE_LINE);
    expect(shape.broken, `${at}: texts broken ${shape.widths.join(' | ')}`).toEqual([]);
    expect(shape.splitShown, `${at}: the split in the pill`).toBe(width >= 1280);
    expect(shape.totalsTitle, `${at}: the split in the tooltip`).toContain('cached');
    expect(shape.serverShown, `${at}: the server figure`).toBe(
      width >= 1600 && account.administrator,
    );
    if (width >= 1280) await expectPillOnOneLine(page, at);
  }
}

/** Opens a run's page and waits for the meter of the top bar. */
async function startRun(page: Page): Promise<void> {
  await startUnderstand(page, ['Catalog', 'Controllers']);
  await openRunTab(page, 'All agents');
  await expect(page.getByTestId('topbar-run-meter')).toBeVisible({ timeout: 30_000 });
}

async function stopRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Stopped by you', { timeout: 30_000 });
  await expect(page.getByTestId('topbar-run-meter')).toHaveCount(0);
}

test(
  'RF-1003 RF-1010 P8-101 the header is one line with the run meter at 1280 px, the meter has a line under the wordmark at 1024 px and the account group wraps whole on a phone',
  { tag: '@visual' },
  async ({ page }, info) => {
    test.setTimeout(150_000);
    account.displayName = MEDIUM_NAME;
    account.administrator = false;
    account.largestTotals = true;
    await actAs(page);
    await openScannedStartPage(page);
    await expect(page.getByTestId('header-totals')).toBeVisible();

    await expectHeaderWithoutRun(page, info, [1280, 1024]);

    await startRun(page);

    // 1280 px: the whole header is one line. 1024 px: the meter has a line of its own under the
    // wordmark, and every other part of the header shares the first. The split is the pill's tooltip.
    for (const width of [1280, 1024]) {
      const { shape, at } = await shapeAt(page, info, width, 'run');
      expectLine(shape, at, width);
      expect(shape.splitShown, `${at}: the split out of the pill`).toBe(false);
      expect(shape.totalsTitle, `${at}: the split in the tooltip`).toContain('cached');
      // With the largest totals and a run the line is full at 1280 px: the name gives way first.
      if (width < 1280) expect(shape.nameCut, `${at}: a short name is whole`).toBe(false);
      if (width === 1280)
        expect(shape.height, `${at}: the header height`).toBeLessThanOrEqual(ONE_LINE_HEIGHT);
    }

    // A phone: the header wraps, the group wraps whole (the name stays whole beside Sign out) and
    // the page never scrolls sideways.
    for (const width of [390, 360]) {
      const { shape, at } = await shapeAt(page, info, width, 'run');
      expect(shape.nameCut, `${at}: the name is whole, the group wrapped instead`).toBe(false);
    }

    await stopRun(page);
  },
);

test(
  'RF-1003 RF-1010 RF-1106 P8-101 the administrator with a run and a long meter has one line at 1280 px, with the server figure out of the header',
  { tag: '@visual' },
  async ({ page }, info) => {
    test.setTimeout(150_000);
    account.displayName = MEDIUM_NAME;
    account.administrator = true;
    account.largestTotals = true;
    await actAs(page);
    await openScannedStartPage(page);
    await expectHeaderWithoutRun(page, info, [1600, 1440, 1280, 1024]);
    // The longest meter and the largest totals together are more than a line at 1280 px in any
    // font: with the long meter the totals are ordinary ones.
    account.largestTotals = false;
    await startRun(page);
    await page.reload();
    await expect(page.getByTestId('topbar-run-meter')).toBeVisible({ timeout: 30_000 });
    await lengthenMeter(page);

    for (const width of [1440, 1280]) {
      const { shape, at } = await shapeAt(page, info, width, 'administrator');
      expectLine(shape, at, width);
      expect(shape.serverShown, `${at}: the server figure out of the header`).toBe(false);
      expect(shape.height, `${at}: the header height`).toBeLessThanOrEqual(ONE_LINE_HEIGHT);
    }
    {
      const { shape, at } = await shapeAt(page, info, 1600, 'administrator');
      expect(shape.serverShown, `${at}: the server figure in the header`).toBe(true);
      expect(shape.spread, `${at}: the header line`).toBeLessThanOrEqual(ONE_LINE);
    }
    {
      const { shape, at } = await shapeAt(page, info, 1024, 'administrator');
      expectLine(shape, at, 1024);
    }
    for (const width of [390, 360]) await shapeAt(page, info, width, 'administrator');

    await stopRun(page);
  },
);

test(
  'RF-1003 RF-1010 RF-1102 P8-101 a name of 200 characters is cut with an ellipsis and no page scrolls sideways from 360 px to 1440 px',
  { tag: '@visual' },
  async ({ page }, info) => {
    test.setTimeout(150_000);
    account.administrator = false;
    account.largestTotals = true;
    account.displayName = LONG_NAME;
    await actAs(page);
    await openScannedStartPage(page);
    await expectHeaderWithoutRun(page, info, [1280, 1024]);
    account.largestTotals = false;
    await startRun(page);

    for (const name of [LONG_NAME, WIDE_NAME]) {
      account.displayName = name;
      await page.reload();
      await expect(page.getByTestId('topbar-run-meter')).toBeVisible({ timeout: 30_000 });
      await lengthenMeter(page);
      for (const width of [1440, 1280, 1024, 800, 640, 390, 360]) {
        const { shape, at } = await shapeAt(page, info, width, `${String(name.length)} characters`);
        expect(shape.nameCut, `${at}: the name is cut`).toBe(true);
        expect(shape.nameEllipsis, `${at}: with an ellipsis`).toBe(true);
        expect(shape.nameTitle, `${at}: the full name in its tooltip`).toBe(name);
        expect(shape.nameText, `${at}: the full name in the page`).toBe(name);
        if (width >= 1024) expectLine(shape, at, width);
        if (width === 640)
          expect(shape.accountSpread, `${at}: the account group`).toBeLessThanOrEqual(ONE_LINE);
      }
    }

    await stopRun(page);
  },
);
