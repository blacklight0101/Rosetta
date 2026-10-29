import type { Page, Response } from '@playwright/test';
import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';
import { openStartPage } from './support/live-run-page.js';
import { openPlanSetup, openStep, recorded, understandCatalog } from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-612, RF-639, DEC-176: the build method step of Plan setup in the browser. The spec has a file
// of its own, so its `plan` account, project and brief are its own (account-key.ts): the step opens
// on a brief that never answered the question, whatever plan-setup.spec.ts saved before it.

const savedResponse = (page: Page): Promise<Response> =>
  page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().endsWith('/planning-brief'),
  );

// "What I recorded" follows the draft on the page, not the saved brief, so a reload right after a
// click on Save can beat the save: wait for the response of the save, the real signal that it landed.
async function save(page: Page): Promise<void> {
  const saved = savedResponse(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).ok()).toBe(true);
}

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('plan', info.project.name));
});

test('RF-612 RF-639 the build method step asks agents or people, then the tool, then the models of each tool', async ({
  page,
}) => {
  // A scan, then an understand run: longer than the default 30 s.
  test.setTimeout(240_000);
  await understandCatalog(page);
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Build method');
  const agents = page.getByRole('radio', { name: /^Agents will build/u });
  const people = page.getByRole('radio', { name: /^People will build/u });
  await expect(agents).not.toBeChecked();
  await expect(people).not.toBeChecked();
  await expect(page.getByText(/Leaves out/u).first()).toBeVisible();
  await expectNoSeriousViolations(page);

  await agents.focus();
  await page.keyboard.press('Space');
  await expect(agents).toBeChecked();
  await expect(page.getByLabel(/^Middle tier/u)).toHaveCount(0);
  await page.getByRole('radio', { name: /^Codex/u }).check();
  await expect(page.getByLabel(/^Middle tier/u)).toHaveAttribute('placeholder', /middle model/u);
  await page.getByLabel(/^Middle tier/u).fill('gpt-mid');
  await save(page);
  await expect(recorded(page)).toContainText(
    'Agents will build with Codex. Models: middle gpt-mid',
  );
  await page.reload();
  await openStep(page, 'Build method');
  await expect(page.getByRole('radio', { name: /^Codex/u })).toBeChecked();
  await expect(page.getByLabel(/^Middle tier/u)).toHaveValue('gpt-mid');
  await expectNoSeriousViolations(page);

  await page.getByRole('radio', { name: /^Another tool/u }).check();
  await expect(page.getByLabel(/^Middle tier/u)).toHaveCount(0);
  await page.getByLabel('Name of the tool').fill('Aider');
  await expect(page.getByLabel(/^Middle tier/u)).toHaveValue('gpt-mid');
  await save(page);
  await expect(recorded(page)).toContainText(
    'Agents will build with Aider. Models: middle gpt-mid',
  );

  await people.check();
  await save(page);
  await expect(recorded(page)).toContainText('People will build');
  await expectNoSeriousViolations(page);
});

// RF-612, RF-605: the page shows an answer the moment it is chosen; a save that lands later must not
// put the answer it carried over the one chosen while it was on its way.
test('RF-612 an answer changed while a save is on its way is kept when the save lands', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await understandCatalog(page);
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Build method');
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/projects/*/planning-brief', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    await held;
    return route.fallback();
  });
  const people = page.getByRole('radio', { name: /^People will build/u });
  await page.getByRole('radio', { name: /^Agents will build/u }).check();
  const saved = savedResponse(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await people.check();
  release();
  await saved;
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(people).toBeChecked();
  await expect(recorded(page)).toContainText('People will build');
});

// RF-639, RF-641, DEC-185, P6-22: the runs-locally checkbox of a tier model: labelled, operable by
// keyboard, kept by a save and a reload, and free of serious accessibility violations.
test('RF-639 a tier model can be marked as running locally with the keyboard, and it is kept', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await understandCatalog(page);
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Build method');
  await page.getByRole('radio', { name: /^Agents will build/u }).check();
  await page.getByRole('radio', { name: /^Codex/u }).check();
  const local = page.getByRole('checkbox', { name: /^Runs locally: middle tier model/iu });
  await expect(local).not.toBeChecked();
  await local.focus();
  await page.keyboard.press('Space');
  await expect(local).toBeChecked();
  await expectNoSeriousViolations(page);
  await save(page);
  await expect(recorded(page)).toContainText('runs locally: middle');

  await page.reload();
  await openStep(page, 'Build method');
  await expect(local).toBeChecked();
  await expectNoSeriousViolations(page);
});
