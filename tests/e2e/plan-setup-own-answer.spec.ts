import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';
import { openStartPage } from './support/live-run-page.js';
import { openPlanSetup, openStep, recorded, understandCatalog } from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-645, RF-605, DEC-178: a typed answer is saved in the brief and shown in "What I recorded"; the
// option cards and the typed-answer field work from the keyboard. The spec has a file of its own and
// depends on no state saved by another spec. Serial: the second test reads the brief the first saved.

test.describe.configure({ mode: 'serial' });

const NOTE = 'Recorded; the plan uses the default until typed answers reach the planner';

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('plan', info.project.name));
});

test('RF-645 RF-605 a typed answer to the migration question is saved and shown in What I recorded', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await understandCatalog(page);
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Migration');
  await expect(page.getByRole('radio', { name: /^Strangler Fig \(Recommended\)/u })).toBeVisible();
  await page.getByRole('radio', { name: /^Type your own answer/u }).check();
  await page.getByRole('textbox', { name: 'Your answer' }).fill('Move one module a week.');
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(recorded(page)).toContainText('Your own answer: Move one module a week.');
  await expect(recorded(page)).toContainText(NOTE);

  await page.reload();
  await openStep(page, 'Migration');
  await expect(page.getByRole('radio', { name: /^Type your own answer/u })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toHaveValue(
    'Move one module a week.',
  );
});

test('RF-645 the option cards and the typed answer work from the keyboard, and the steps pass axe', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Migration');
  const first = page.getByRole('radio', { name: /^Strangler Fig \(Recommended\)/u });
  const own = page.getByRole('radio', { name: /^Type your own answer/u });

  // Arrow keys move through the cards of one question and wrap from the first to the last.
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /^Parallel Change/u })).toBeChecked();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(own).toBeChecked();
  await expect(own).toBeFocused();
  const field = page.getByRole('textbox', { name: 'Your answer' });
  await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Keep the old site until the last module moves.');
  await expect(field).toHaveValue('Keep the old site until the last module moves.');

  await openStep(page, 'Stack');
  await expect(page.getByRole('radiogroup').first().getByRole('radio')).toHaveCount(4, {
    timeout: 20_000,
  });
  await expectNoSeriousViolations(page);
  await openStep(page, 'Project context');
  const teamSize = page.getByRole('radiogroup', { name: 'Choose an answer for team size' });
  await teamSize.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(teamSize.getByRole('radio').nth(1)).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Team size', exact: true })).not.toHaveValue('');
  await expectNoSeriousViolations(page);
});
