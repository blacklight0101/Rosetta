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

  await page.goto('/projects');

  const pill = page.getByTestId('header-totals');
  await expect(pill).toContainText('Server, this month');
  await expect(pill).toContainText(/\$[\d.]+ of \$10\.00/u);
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

test('RF-428 a tiny cost keeps its exact figure hidden until keyboard focus, and Escape closes it', async ({
  context,
  page,
}, info) => {
  await signInAs(context, costAccountFor('cost', info.project.name));
  await openStartPage(page);
  // The cost answer with a total of 7 micro-dollars, which reads `<$0.0001` and offers its exact figure.
  await page.route('**/api/projects/*/cost', async (route) => {
    const response = await route.fetch();
    const body: unknown = await response.json();
    const totals = z.object({ totals: z.record(z.string(), z.unknown()) }).loose();
    const cost = [{ currency: 'USD', costMicros: '7' }];
    const parsed = totals.parse(body);
    await route.fulfill({ response, json: { ...parsed, totals: { ...parsed.totals, cost } } });
  });

  await page
    .getByTestId('header-totals')
    .getByRole('link', { name: /Your total/u })
    .click();

  const region = page.getByRole('region', { name: 'Project totals' });
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
