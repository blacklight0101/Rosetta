import type { BrowserContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage, startCatalogRun, tokensOf } from './support/cost-run.js';
import { openStartPage, runStatus, RUN_DONE } from './support/live-run-page.js';
import { costAccountFor } from './support/seed-cost.js';
import { signInAs } from './support/sign-in.js';

// RF-1010, RF-1106, RF-428, DEC-49, P1-36: the totals pill of the header and the cost page, driven by
// the real test server. The run replays the recorded understand run of the C# fixture (serve.ts); its
// models are local, so its calls add tokens at a cost of zero. seed-cost.ts spends $8.50 of the
// server's $10.00 this month, so every administrator sees the cap banner.

test('RF-1010 the header totals follow a run live without a reload, with the breakdown one click away', async ({
  context,
  page,
}, info) => {
  // A scan when the project has none yet, then an understand run: longer than the default 30 s.
  test.setTimeout(150_000);
  await signInAs(context, costAccountFor('cost', info.project.name));
  await openScannedStartPage(page);
  const pill = page.getByTestId('header-totals');
  await expect(pill).toContainText('Your total');
  await expect(pill).toContainText(/\d tokens/u);
  const before = await tokensOf(pill);
  await page.evaluate(() => Reflect.set(globalThis, 'rstSamePage', true));

  await startCatalogRun(page);

  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 60_000 });
  await expect.poll(() => tokensOf(pill), { timeout: 15_000 }).toBeGreaterThan(before);
  expect(await page.evaluate(() => Reflect.get(globalThis, 'rstSamePage') === true)).toBe(true);
  await expect(pill).not.toContainText('Server, this month');

  await openStartPage(page);
  await pill.getByRole('link', { name: /Your total/u }).click();
  await expect(page.getByRole('heading', { name: 'Project cost', level: 1 })).toBeVisible();
  await expect(page.getByRole('table', { name: 'By run' }).getByRole('link')).not.toHaveCount(0);
  await expect(page.getByRole('table', { name: 'By model' })).toContainText('Local');
  await expectNoSeriousViolations(page);
});

test('RF-1106 RF-1010 the administrator sees the server month against the cap and the banner from 80%', async ({
  context,
  page,
}, info) => {
  await signInAs(context, costAccountFor('cost-admin', info.project.name));

  // P8-101, P8-138: the header shows the server month from 1600 px and leaves it to the users and
  // caps page below; toContainText reads hidden text too, so the figure is checked to be seen.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/projects');
  const server = page.getByTestId('header-server-month');
  await expect(server).toBeAttached();
  await expect(server).toBeHidden();

  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(server).toBeVisible();
  await expect(server).toContainText('Server, this month');
  await expect(server).toContainText(/\$[\d.]+ of \$10\.00/u);
  const banner = page.getByRole('status').filter({ hasText: 'of its monthly cap' });
  await expect(banner).toContainText(/The server has used (8[5-9]|9\d|100)% of its monthly cap/u);
  await expectNoSeriousViolations(page);
});

test('RF-1106 a user sees neither the server month nor the banner', async ({
  context,
  page,
}, info) => {
  await signInAs(context, costAccountFor('cost', info.project.name));

  await page.goto('/projects');

  await expect(page.getByTestId('header-totals')).toContainText('Your total');
  await expect(page.getByTestId('header-totals')).not.toContainText('Server, this month');
  await expect(page.getByText('of its monthly cap')).toHaveCount(0);
});

const tiny = [{ currency: 'USD', costMicros: '7' }];
const rolesOf = (totals: Record<string, unknown>) =>
  ['reader', 'verifier', 'summariser'].map((key) => ({
    key,
    local: false,
    totals: { ...totals, cost: tiny },
  }));

/** The cost answer with a total of 7 micro-dollars, which reads `<$0.0001` and offers its exact figure, and
 * three role lines of the same cost. */
async function openCostPageOfTinyCosts(
  page: Page,
  context: BrowserContext,
  account: ReturnType<typeof costAccountFor>,
): Promise<Locator> {
  await signInAs(context, account);
  await openStartPage(page);
  await page.route('**/api/projects/*/cost', async (route) => {
    const response = await route.fetch();
    const body: unknown = await response.json();
    const parsed = z
      .object({ totals: z.record(z.string(), z.unknown()) })
      .loose()
      .parse(body);
    const totals = { ...parsed.totals, cost: tiny };
    await route.fulfill({
      response,
      json: { ...parsed, totals, byRole: rolesOf(totals) },
    });
  });
  await page
    .getByTestId('header-totals')
    .getByRole('link', { name: /Your total/u })
    .click();
  return page.getByRole('region', { name: 'Project totals' });
}

test('RF-428 a tiny cost keeps its exact figure hidden until keyboard focus, and Escape closes it', async ({
  context,
  page,
}, info) => {
  const region = await openCostPageOfTinyCosts(
    page,
    context,
    costAccountFor('cost', info.project.name),
  );

  const amount = region.getByText('<$0.0001', { exact: true });
  const exact = region.getByText('$0.000007', { exact: true });
  await expect(amount).toBeVisible();
  await expect(exact).toBeHidden();
  await amount.focus();
  await expect(exact).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(exact).toBeHidden();
  await expect(amount).toBeFocused();
});

test('RF-428 Escape closes the exact figure of an amount the pointer rests on without focus', async ({
  context,
  page,
}, info) => {
  const region = await openCostPageOfTinyCosts(
    page,
    context,
    costAccountFor('cost', info.project.name),
  );
  const amount = region.getByText('<$0.0001', { exact: true });
  const exact = region.getByText('$0.000007', { exact: true });

  await amount.hover();
  await expect(exact).toBeVisible();
  await expect(amount).not.toBeFocused();
  await page.keyboard.press('Escape');

  await expect(exact).toBeHidden();
  await page.mouse.move(0, 0);
  await amount.hover();
  await expect(exact).toBeVisible();
});

test('RF-428 the amounts of a table take one tab stop and the arrow keys reach the others', async ({
  context,
  page,
}, info) => {
  await openCostPageOfTinyCosts(page, context, costAccountFor('cost', info.project.name));
  const roles = page.getByRole('table', { name: 'By role' });
  const amounts = roles.getByText('<$0.0001', { exact: true });
  await expect(amounts).toHaveCount(3);

  await expect(roles.locator('[tabindex="0"]').filter({ hasText: '<$0.0001' })).toHaveCount(1);
  await amounts.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(amounts.nth(1)).toBeFocused();
  await expect(roles.getByText('$0.000007', { exact: true }).nth(1)).toBeVisible();
  await page.keyboard.press('End');
  await expect(amounts.nth(2)).toBeFocused();
  await expect(roles.locator('[tabindex="0"]').filter({ hasText: '<$0.0001' })).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(amounts.nth(2)).not.toBeFocused();
  await expect(roles.locator(':focus').filter({ hasText: '<$0.0001' })).toHaveCount(0);
});

test('RNF-010 a table caption of the cost page wraps at word boundaries at 360 px', async ({
  context,
  page,
}, info) => {
  await signInAs(context, costAccountFor('cost', info.project.name));
  await page.setViewportSize({ width: 360, height: 780 });
  await openStartPage(page);
  await page
    .getByTestId('header-totals')
    .getByRole('link', { name: /Your total/u })
    .click();

  const caption = page.getByRole('table', { name: 'By model' }).locator('caption');
  await expect(caption).toBeVisible();
  const { height, lineHeight, width } = await caption.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
    width: element.getBoundingClientRect().width,
  }));
  // "By model" fits on one line, so one letter per line (the caption shrunk to its narrowest) is far taller.
  expect(width).toBeGreaterThan(200);
  expect(height).toBeLessThan(lineHeight * 3);
});
