import { access } from 'node:fs/promises';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { confirmation, plantSnapshot } from './support/history-page.js';
import {
  openStartPage,
  runStatus,
  startAndOpenLiveRun,
  startUnderstand,
} from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-1012, RF-1102, RF-1105, P1-40: the administrator's snapshots page, against the real server. A
// snapshot of this Playwright project's own repository is put in the cache the way the fetcher leaves
// one (read-only), so deleting it disturbs no other spec; the snapshot of `octo/webforms` is used by a
// run in progress, so its button is disabled.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('history-admin', info.project.name));
});

test('RF-1012 lists the snapshots with their size and use, and deletes an unused one after asking', async ({
  page,
}, info) => {
  const planted = await plantSnapshot(info.project.name);

  await page.goto('/admin/snapshots');

  const table = page.getByRole('table', { name: 'Downloaded snapshots' });
  const row = table.getByRole('row').filter({ hasText: planted.repository });
  await expect(row).toContainText(planted.shortCommit);
  await expect(row).toContainText('18.4 MB');
  await expect(row).toContainText('unused');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  await row.getByRole('button', { name: /^Delete:/u }).click();
  const dialog = confirmation(page);
  await expect(dialog).toContainText(`sources/${planted.key}`);
  await expect(dialog).toContainText('18.4 MB');
  await expect(dialog).toContainText('This cannot be undone.');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await dialog.getByRole('button', { name: 'Delete snapshot' }).click();

  await expect(row).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '18.4 MB freed' })).toBeVisible();
  await expect(access(planted.folder)).rejects.toThrow();
});

test('RF-1012 disables Delete for the snapshot that a run in progress uses, with the reason', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByLabel('Scan only').check();
  await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  await startUnderstand(page, ['Catalog', 'Controllers']);
  const live = page.url();

  await page.goto('/admin/snapshots');

  const row = page.getByRole('row').filter({ hasText: 'octo/webforms' });
  const button = row.getByRole('button', { name: /^Delete \(in use\)/u });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('title', 'In use by a running run');
  await expect(row).toContainText('running');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  await page.goto(live);
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });
});
