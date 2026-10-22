import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openStartPage, runStatus, startUnderstand } from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { queueTag } from './support/views.js';

// RF-1108: a queued run turns to "started" when the run before it ends. The run queue is one per
// server, shared by every worker, so this file runs in the `queue` project of playwright.config.ts:
// after the four view projects have finished, and alone. Other specs starting runs on the same
// server would otherwise put a run ahead of this one (position 2 or 3, #771).

test(
  'RF-1108 a queued run turns to started on the start page when the run before it ends',
  { tag: queueTag },
  async ({ page, context }, info) => {
    await signInAs(context, accountFor('start-run', info.project.name));
    const held = await startUnderstand(page, ['Controllers']);
    await openStartPage(page);
    await page.getByLabel('Scan only').check();
    await page.getByRole('button', { name: /^Start run/u }).click();
    const notice = page.getByTestId('run-notice');
    await expect(notice).toContainText('Queued');
    await expect(notice).toContainText('position 1');

    const other = await context.newPage();
    await other.goto(held);
    await other.getByRole('button', { name: 'Stop run' }).click();
    await expect(runStatus(other)).toContainText('Interrupted', { timeout: 30_000 });
    await other.close();

    await expect(notice).toContainText('Run started', { timeout: 30_000 });
    await expect(notice.getByRole('button', { name: 'Cancel queued run' })).toHaveCount(0);
    await expectNoSeriousViolations(page);
  },
);
