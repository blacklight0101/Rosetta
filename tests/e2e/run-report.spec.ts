import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { replayRunId } from './support/seed-replay.js';
import { expectNothingInjected, hostileTexts, watchDialogs } from './support/hostile-card.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-504, RF-506, DEC-131, RNF-010, P1-97: the report is built from the page of a finished recorded
// run (seed-replay.ts), the way the owner does it: open the run, press Build report, follow the
// links. The server writes the real files; nothing of our own API is replaced.

const runPage = (project: string): string => `/runs/${replayRunId(project)}`;

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('replay', info.project.name));
});

test('RF-504 builds the report from the page of a finished run and links the report and the replay', async ({
  page,
}, info) => {
  await page.goto(runPage(info.project.name));
  const build = page.getByRole('button', { name: 'Build report' });
  await expect(build).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Open the run replay' })).toHaveCount(0);
  await expectNoSeriousViolations(page);

  await build.click();

  const replay = page.getByRole('link', { name: 'Open the run replay' });
  await expect(replay).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the report', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the report as Markdown' })).toBeVisible();
  await expectNoSeriousViolations(page);

  // The report and the replay are pages of their own: follow one, then open the other.
  const replayAddress = await replay.getAttribute('href');
  await page.getByRole('link', { name: 'Open the report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Run report', level: 1 })).toBeVisible();
  await page.goto(replayAddress ?? '');
  await expect(page.getByRole('heading', { name: 'Run replay', level: 1 })).toBeVisible();
});

test('RF-507 the hostile card is text in the report page: nothing runs and no element is injected', async ({
  page,
}, info) => {
  const dialogs = watchDialogs(page);
  await page.goto(runPage(info.project.name));
  await page.getByRole('button', { name: 'Build report' }).click();

  await page.getByRole('link', { name: 'Open the report', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Run report', level: 1 })).toBeVisible();
  await expect(page.locator('body')).toContainText(hostileTexts.script);
  await expect(page.locator('script')).toHaveCount(0);
  await expectNothingInjected(page, dialogs);
  await expectNoSeriousViolations(page);
});
