import { z } from 'zod';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import { openStartPage } from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { leaveOnlyThisInTheDay } from './support/seed-limits.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';
import { chooseModel } from './support/choose-model.js';

// RF-002, RF-1001, RF-1106, DEC-108, P1-106: what the start page and the settings page read
// from the server, driven against the test server. Two tabs cannot overwrite each other's settings (a
// save made from an older version is refused with RST-1007); the estimate warning names what is
// really left of the user's day. The queue position (RF-1108) is in start-run-queue.spec.ts. The
// steps run in order because they share the account's project and runs, and the last one leaves
// the account with an almost spent day.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('start-run', info.project.name));
});

test('RF-002 a settings save made from an older version is refused with RST-1007', async ({
  page,
  context,
}) => {
  await openScannedStartPage(page);
  await page.getByRole('link', { name: 'Project settings' }).click();
  await expect(page.getByRole('heading', { name: 'Project settings', level: 1 })).toBeVisible();
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.getByLabel('Parallel readers', { exact: true })).toHaveValue('1');

  await page.getByLabel('Parallel readers', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await second.getByLabel('Parallel readers', { exact: true }).fill('3');
  await second.getByRole('button', { name: 'Save settings' }).click();

  await expect(second.getByRole('alert')).toContainText('RST-1007');
  await expect(second.getByText('Settings saved.')).toHaveCount(0);
  await expectNoSeriousViolations(second);
  await second.reload();
  await expect(second.getByLabel('Parallel readers', { exact: true })).toHaveValue('2');
  await second.getByLabel('Parallel readers', { exact: true }).fill('1');
  await second.getByRole('button', { name: 'Save settings' }).click();
  await expect(second.getByText('Settings saved.')).toBeVisible();
  await second.close();
});

test('RF-113 the start page announces an outdated code map and holds an Understand start until it is confirmed', async ({
  page,
}) => {
  await openScannedStartPage(page);
  await page.route('**/api/projects/*/estimate*', async (route) => {
    const response = await route.fetch();
    const body = z.record(z.string(), z.unknown()).parse(await response.json());
    await route.fulfill({
      response,
      json: {
        ...body,
        codeMap: { scannerVersion: null, currentScannerVersion: 1, outdated: true },
      },
    });
  });
  await openStartPage(page);
  await expect(page.getByText('The code map is out of date.')).toBeVisible();
  const startButton = page.getByRole('button', { name: /^Start run/u });
  await expect(page.getByLabel('Understand')).toBeChecked();
  await expect(startButton).toBeDisabled();
  await page.getByLabel('Use the old code map for this run').check();
  await expect(startButton).toBeEnabled();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Scan again' }).click();
  await expect(page.getByLabel('Scan only')).toBeChecked();
  await expect(page.getByText('The code map is out of date.')).toHaveCount(0);
  await expect(startButton).toBeEnabled();
  await page.unroute('**/api/projects/*/estimate*');
});

test('DEC-108 the warning names what is left of the day, not the whole cap', async ({
  page,
}, info) => {
  await leaveOnlyThisInTheDay(accountFor('start-run', info.project.name).userName, 1n, 1_000_000n);
  await openScannedStartPage(page);
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Reader', 'gpt-5-nano');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();

  const consent = 'I understand; send masked excerpts to OpenAI for this run';
  await page.getByLabel(consent).check();

  const warning = page.getByTestId('cap-warning');
  await expect(warning).toContainText('daily cap today');
  await expect(warning).toContainText('$0.000001 left of $1.00');
  await expect(page.getByRole('button', { name: /^Start run/u })).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});
