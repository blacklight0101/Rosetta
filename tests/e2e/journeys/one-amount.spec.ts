import { expect, test } from '../support/fixtures.js';
import { openScannedStartPage } from '../support/cost-run.js';
import { openRunTab, runStatus, startUnderstand, RUN_DONE } from '../support/live-run-page.js';
import { accountFor } from '../support/seed.js';
import { signInAs } from '../support/sign-in.js';

// RF-1003, RF-434, RF-209, DEC-205, DEC-206, DEC-211 (P8-24): a run of a journey shows one amount
// everywhere, what is left of the approved amount, and never the project run cap. The run is a real
// run of the test server (the model double replays the recorded understand run). The project reads on
// Ollama, so the amount is counted in tokens (P5-07); a priced model counts it in dollars.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('live-controls', info.project.name));
});

test('RF-1003 RF-434 RF-209 P8-24 a run of a journey shows one amount, what is left of the approved amount, in the header, the spend panel, the run meter and the Deepen panel', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openScannedStartPage(page);
  await startUnderstand(page, ['Catalog']);
  // The e2e project reads on Ollama, so the amount is counted in tokens (P5-07).
  const left = /[\d,]+ tokens left of [\d,]+ approved/u;

  await expect(page.getByTestId('topbar-run-meter')).toContainText(left, { timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Spend for this run' })).toContainText(left);
  await expect(page.getByRole('region', { name: 'Spend for this run' })).not.toContainText('cap');
  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 90_000 });
  await openRunTab(page, 'Evidence');
  const turn = page.getByRole('region', { name: 'Your turn' });
  await turn.getByRole('button', { name: 'Deepen this run' }).click();

  await expect(turn.getByTestId('deepen-stops')).toContainText(/[\d,]+ tokens left of [\d,]+$/u);
  await expect(turn.getByTestId('deepen-stops')).not.toContainText('run cap');
  await expect(turn).toContainText('pauses and asks you before it spends more');
  // The high figure may pass what is left; the warning then shows once, against the approved amount.
  expect(await turn.getByTestId('deepen-over-cap').count()).toBeLessThanOrEqual(1);
  await expect(turn).not.toContainText('run cap');
  await turn.getByRole('button', { name: 'Start Deepen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Start this Deepen?' });
  await expect(dialog.locator('p')).toHaveCount(1);
  await expect(dialog).toContainText(
    /Up to \d rounds?, likely .* It stops at the [\d,]+ tokens left of your/u,
  );
  await expect(dialog).not.toContainText('judges');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(/cap \$0\.50/u)).toHaveCount(0);
});
