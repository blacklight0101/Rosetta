import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';
import {
  openQuestion,
  openRunTab,
  saveAnswers,
  saveAnswersButton,
} from './support/live-run-page.js';
import { understandCatalog } from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { seededQuestions, seedThreeOpenQuestions } from './support/seed-questions.js';
import { signInAs } from './support/sign-in.js';

// RF-1007, RF-647 (P8-86, UX-24): three answers on the Your questions tab are saved with one click
// of "Save answers (3)", in one request, and the three questions move to "Answered" together. The
// account is this test's own (accountFor), its run is the recorded understand run of the Catalog
// area, which asks nothing, so the run gets the three open questions of the case in the account's
// own answers.md (seed-questions.ts); nothing is written outside the account.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('plan', info.project.name));
});

const ids = seededQuestions.map((_, index) => `OQ-00${String(index + 1)}`);

/** An ended understand run of the account with the three open questions, on its Your questions tab. */
async function runWithThreeQuestions(page: Page): Promise<void> {
  await understandCatalog(page);
  const runUuid = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  await seedThreeOpenQuestions(page, runUuid);
  await page.reload();
  await openRunTab(page, 'Your questions');
  for (const id of ids) {
    await expect(openQuestion(page, id)).toContainText('Open');
  }
}

test('RF-1007 three answers are saved with one click of Save answers', async ({ page }) => {
  // A scan, then an understand run: longer than the default 30 s.
  test.setTimeout(240_000);
  await runWithThreeQuestions(page);
  await expect(saveAnswersButton(page)).toHaveText('Save answers (0)');

  // The second option ("No") of each question, then one click.
  for (const id of ids) {
    await openQuestion(page, id).getByRole('radio', { name: 'No', exact: true }).check();
  }
  await expect(saveAnswersButton(page)).toHaveText('Save answers (3)');
  await expectNoSeriousViolations(page);
  const puts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/answers')) {
      puts.push(request.postData() ?? '');
    }
  });
  await saveAnswers(page);

  const answered = page.getByTestId('answered-questions');
  await expect(answered.locator('summary')).toHaveText('Answered (3)');
  await expect(page.getByTestId('answers-status')).toHaveText(
    'Saved. 0 questions wait for an answer.',
  );
  expect(puts).toHaveLength(1);
  for (const id of ids) {
    expect(puts[0]).toContain(`"cardId":"${id}"`);
    await expect(openQuestion(page, id)).toContainText('Answer saved in answers.md.');
  }
  await expect(saveAnswersButton(page)).toHaveText('Save answers (0)');

  // The three answers are in answers.md: the page shows them again after a reload.
  await page.reload();
  await openRunTab(page, 'Your questions');
  await expect(answered.locator('summary')).toHaveText('Answered (3)');
  await answered.locator('summary').click();
  for (const id of ids) {
    await expect(
      openQuestion(page, id).getByRole('radio', { name: 'No', exact: true }),
    ).toBeChecked();
  }
  await expectNoSeriousViolations(page);
});
