import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-425 (second scenario), DEC-97, P2-08: the start page asks before an understand run whose
// likely cost is above the confirm threshold, and the whole question is answered with the keyboard.
// The account is the one of the `start-run` kind, as the other start page specs use it.

const startButton = { name: /^Start run/u } as const;
const consent = 'I understand; send masked excerpts to OpenAI for this run';

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('start-run', info.project.name));
});

/** The reader runs on OpenAI with the server's key, so the estimate has a cost. */
async function openWithCloudReader(page: Page): Promise<void> {
  await openScannedStartPage(page);
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await page.getByLabel('Reader model', { exact: true }).fill('gpt-5-nano');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
  await page.getByLabel(consent).check();
}

/** Stops the run the notice names (or cancels it when queued) and waits until it has ended. */
async function endTheRun(page: Page): Promise<void> {
  const notice = page.getByTestId('run-notice');
  await notice.getByRole('link', { name: 'Open the live run' }).click();
  await expect(page.getByRole('heading', { name: 'Live run', level: 1 })).toBeVisible();
  const endOfRun = page.getByRole('button', { name: /^(Stop run|Cancel queued run)$/u });
  if (await endOfRun.isVisible()) await endOfRun.click();
  await expect(endOfRun).toHaveCount(0, { timeout: 60_000 });
}

/** The dialog fits the viewport (1280 or 360 px wide) and does not scroll sideways (RNF-010). */
async function expectInsideTheViewport(page: Page, dialog: Locator): Promise<void> {
  const box = await dialog.boundingBox();
  const view = page.viewportSize();
  if (box === null || view === null) throw new Error('The dialog or the viewport has no size.');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width);
  const sideways: unknown = await page.evaluate(
    `(() => { const d = document.querySelector('dialog[open]'); return d.scrollWidth - d.clientWidth; })()`,
  );
  expect(sideways).toBe(0);
}

test(
  'RF-425 a likely estimate above the threshold asks before the run starts, with the keyboard alone',
  { tag: '@phone' },
  async ({ page }) => {
    test.setTimeout(90_000);
    await openWithCloudReader(page);
    // A tiny threshold puts the likely cost above it whatever the demo project costs.
    await page.getByLabel('Run cap (USD)').fill('2.00');
    await page
      .getByLabel('Ask before a run estimated above (USD)', { exact: true })
      .fill('0.000001');
    const start = page.getByRole('button', startButton);
    await start.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Start this run?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('The likely cost is');
    await expect(dialog).toContainText('openai / gpt-5-nano');
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expectInsideTheViewport(page, dialog);
    await expectNoSeriousViolations(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(start).toBeFocused();
    await expect(page.getByTestId('run-notice')).toHaveCount(0);

    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Confirm and start' })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('run-notice')).toContainText(/Run started|Queued/u);
    await endTheRun(page);
  },
);
