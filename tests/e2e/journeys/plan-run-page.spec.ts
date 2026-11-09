import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { saveBrief, understandFromUrl } from '../support/handoff-journey.js';
import { runStatus } from '../support/live-run-page.js';
import { openStep, writeButton } from '../support/plan-setup-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';

// RF-1015, RF-1002, P8-11: the page of a working plan run. From Plan setup the owner writes the package;
// the run page shows the plan steps only (never a Report step or a Deepen button), the planner step
// working and then done with the package and its checks, and a "Your turn" that points to the
// download. The model answers are recordings (e2e-provider.ts).

test('RF-1015 P8-11 the plan run page shows the plan steps through to the written package and no Report or Deepen', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await signInThroughPage(page, accountFor('journey-run', `${info.project.name}/plan-page`));
  await understandFromUrl(page);
  await openStep(page, 'Build method');
  await saveBrief(page);

  await expect(writeButton(page)).toBeEnabled();
  await writeButton(page).click();

  await expect(
    page.getByRole('heading', { name: /^(Scan|Understand|Deepen|Plan|Run)\b/u, level: 1 }),
  ).toBeVisible({
    timeout: 30_000,
  });
  const steps = page.getByRole('list', { name: 'Pipeline' });
  await expect(steps.getByRole('listitem')).toHaveText([
    /Brief/u,
    /Planner calls/u,
    /Package/u,
    /Checks/u,
  ]);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 90_000 });
  for (const name of ['Brief', 'Planner calls', 'Package', 'Checks']) {
    await expect(steps.getByRole('listitem').filter({ hasText: name })).toContainText('done');
  }
  await expect(steps.getByRole('listitem').filter({ hasText: 'Report' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Deepen/u })).toHaveCount(0);
  const turn = page.getByRole('region', { name: 'Your turn' });
  await expect(turn).toContainText('The plan is written');
  await expect(page.getByRole('link', { name: 'Download hand-off zip' })).toBeVisible();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});
