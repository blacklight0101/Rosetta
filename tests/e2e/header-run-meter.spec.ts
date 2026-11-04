import type { Page } from '@playwright/test';
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
  /** Vertical spread of the centres of every text and control in the header, in px. */
  spread: z.number(),
  /** Texts or controls that break over two lines. */
  broken: z.array(z.string()),
  /** Vertical spread of the user's name, role, Sign out and the theme toggle. */
  accountSpread: z.number(),
  sideways: z.boolean(),
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
    const all = leaves(header);
    const account = [...leaves(header.querySelector('[data-testid="header-user"]')), ...leaves(header.lastElementChild)];
    const broken = all.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 1.6 * parseFloat(getComputedStyle(el).lineHeight) && (el.textContent || '').trim() !== '';
    }).map((el) => (el.textContent || '').trim());
    return {
      spread: spread(all), broken, accountSpread: spread(account),
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  return headerShapeSchema.parse(shape);
}

// A line holds centres a few pixels apart (a bar, a badge and text of different heights).
const ONE_LINE = 8;

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

  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(meter).toBeVisible();
    const shape = await headerShape(page);
    expect(shape.broken, `${String(width)} px: texts broken over two lines`).toEqual([]);
    expect(shape.spread, `${String(width)} px: the header is one line`).toBeLessThanOrEqual(
      ONE_LINE,
    );
    expect(shape.sideways, `${String(width)} px: no sideways scroll`).toBe(false);
    await info.attach(`run-page-${String(width)}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  }

  await page.setViewportSize({ width: 390, height: 780 });
  await expect(meter).toBeVisible();
  const phone = await headerShape(page);
  expect(
    phone.accountSpread,
    '390 px: name, role, Sign out and theme stay together',
  ).toBeLessThanOrEqual(ONE_LINE);
  expect(phone.sideways, '390 px: no sideways scroll').toBe(false);
  await info.attach('run-page-390', { body: await page.screenshot(), contentType: 'image/png' });

  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Stopped by you', { timeout: 30_000 });
  await expect(meter).toHaveCount(0);
});
