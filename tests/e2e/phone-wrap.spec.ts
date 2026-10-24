import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';
import { openStartPage, runStatus, startAndOpenLiveRun } from './support/live-run-page.js';
import { openPlanSetup } from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { fixtureZip, giveReaderToOpenAi, uploadFromNewProject } from './support/zip-journey.js';

// RNF-010, design-system.md (long text wraps): at 360 px a file path or an area name of 120
// characters without a space wraps inside the content column, so the page never scrolls sideways.
// The pages are the real start page, Plan setup and a finished run; the path is added to the
// content column of each one, as the sweep finds it in a large repository (up to 119 characters).

const longPath = 'ServiceFabricARMTemplates'.repeat(5).slice(0, 120);

const phone = { width: 360, height: 780 };

/** Adds the long path as a paragraph at the end of the content column. */
async function addLongPath(page: Page): Promise<void> {
  await page.evaluate(
    `(() => {
      const paragraph = document.createElement('p');
      paragraph.textContent = ${JSON.stringify(longPath)};
      document.querySelector('.rst-main')?.append(paragraph);
    })()`,
  );
}

/** Nothing of the page is beside the viewport. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const sideways: unknown = await page.evaluate(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(Number(sideways)).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('sweep', info.project.name));
});

test(
  'RNF-010 a 120-character path wraps on the start page at 360 px',
  { tag: '@phone' },
  async ({ page }) => {
    await page.setViewportSize(phone);
    await openStartPage(page);
    await addLongPath(page);

    await expect(page.getByText(longPath)).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectNoSeriousViolations(page);
  },
);

test(
  'RNF-010 a 120-character path wraps on Plan setup at 360 px',
  { tag: '@phone' },
  async ({ page }) => {
    await page.setViewportSize(phone);
    await openStartPage(page);
    await openPlanSetup(page);
    await addLongPath(page);

    await expect(page.getByText(longPath)).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectNoSeriousViolations(page);
  },
);

test(
  'RNF-010 a 120-character path wraps on a finished run at 360 px',
  { tag: '@phone' },
  async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(phone);
    await openStartPage(page);
    await page.getByLabel('Scan only').check();
    await startAndOpenLiveRun(page);
    await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
    await addLongPath(page);

    await expect(page.getByText(longPath)).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectNoSeriousViolations(page);
  },
);

test(
  'RNF-010 the "Switch every role to Ollama" button wraps on the start page at 360 px',
  { tag: '@phone' },
  async ({ page }) => {
    await page.setViewportSize(phone);
    await uploadFromNewProject(page, 'PhoneWrap.zip', await fixtureZip());
    await giveReaderToOpenAi(page);

    const button = page.getByRole('button', { name: /^Switch every role to Ollama/u });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(phone.width);
    const overflow: unknown = await button.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(Number(overflow)).toBeLessThanOrEqual(0);
    await expectNoSidewaysScroll(page);
    await expectNoSeriousViolations(page);
  },
);
