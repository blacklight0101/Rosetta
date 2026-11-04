import { expect, test } from './support/fixtures.js';
import { openRunTab, openStartOf, pressStart, runStatus } from './support/live-run-page.js';
import { openPlanSetup, writeButton } from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { revealAreas, showStartChoices } from './support/start-choices.js';

// RF-609, RF-1005, ADR-005, ADR-008 (P8-120): the end-to-end model double has a recorded understand run
// for the seeded Python project `octo/inventory`, so the run ends with cards that cite its files and
// Plan setup can start the plan. The spec has an account kind of its own (`plan-python`).

const inventoryUrl = 'https://github.com/octo/inventory';

test('RF-609 RF-1005 ADR-005 the understand run of the Python project ends with cards and Start the plan is enabled', async ({
  page,
  context,
}, info) => {
  test.setTimeout(240_000);
  await signInAs(context, accountFor('plan-python', info.project.name));
  await page.goto('/projects');
  await openStartOf(page, inventoryUrl);
  await showStartChoices(page);
  await revealAreas(page);
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(areas.locator('label').first()).toBeVisible({ timeout: 60_000 });
  await pressStart(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });

  await openRunTab(page, 'Evidence');
  const evidence = page.getByRole('tabpanel', { name: 'Evidence' });
  await expect(evidence).toContainText('FEAT-001');
  await expect(evidence).toContainText('main.py');
  await expect(evidence).toContainText('inventory/stock.py');

  await page.goto('/projects');
  await openStartOf(page, inventoryUrl);
  await showStartChoices(page);
  await openPlanSetup(page);
  await expect(writeButton(page)).toBeEnabled();
});
