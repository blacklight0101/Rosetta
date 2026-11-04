import { expect, test } from './support/fixtures.js';
import { runRow } from './support/history-page.js';
import { plainFile, writeAndDownload } from './support/handoff-journey.js';
import { openRunTab, openStartOf } from './support/live-run-page.js';
import { openPlanSetup, understandInventory, writeButton } from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { showStartChoices } from './support/start-choices.js';

// RF-609, RF-1005, ADR-005, ADR-008 (P8-120): the end-to-end model double has a recorded understand run
// for the seeded Python project `octo/inventory`, so the run ends with cards that cite its files, the
// verifier judges every claim Supported (it must not take the webforms verdicts, whose card ids repeat
// these), and Plan setup can start a plan whose package cites those cards. The spec has an account kind
// of its own (`plan-python`).

const inventoryUrl = 'https://github.com/octo/inventory';

test('RF-609 RF-1005 ADR-005 the understand run of the Python project ends with cards and Start the plan is enabled', async ({
  page,
  context,
}, info) => {
  test.setTimeout(240_000);
  await signInAs(context, accountFor('plan-python', info.project.name));
  await understandInventory(page);

  await page.getByRole('navigation').getByRole('link', { name: 'History' }).click();
  await runRow(page, '-understand')
    .getByRole('link', { name: /^View run / })
    .click();
  await openRunTab(page, 'Evidence');
  const evidence = page.getByRole('tabpanel', { name: 'Evidence' });
  await expect(evidence).toContainText('FEAT-001');
  await expect(evidence).toContainText('main.py');
  await expect(evidence).toContainText('inventory/stock.py');
  await expect(evidence).toContainText('8 supported');
  await expect(evidence.getByTestId('claim').filter({ hasText: 'BR-002.c1' })).toContainText(
    'Supported',
  );
  await expect(evidence.getByText('Rejected')).toHaveCount(0);

  await page.goto('/projects');
  await openStartOf(page, inventoryUrl);
  await showStartChoices(page);
  await openPlanSetup(page);
  await expect(writeButton(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Use the defaults for the rest' }).click();
  await expect(writeButton(page)).toBeEnabled();

  const files = await writeAndDownload(page);
  // The package is planned from the cards of the Python run, not from the webforms ones.
  const requirements = plainFile(files, 'requirements.md');
  expect(requirements).toContain('List low-stock items');
  expect(requirements).toContain('FEAT-002');
  const sources = plainFile(files, 'sources.md');
  expect(sources).toContain('inventory/stock.py:15-16');
  expect(sources).not.toContain('Default.aspx');
});
