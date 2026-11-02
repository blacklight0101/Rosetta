import { expect, test } from './support/fixtures.js';
import { openStartPage } from './support/live-run-page.js';
import {
  expectOptions,
  openPlanSetup,
  openStep,
  recorded,
  understandCatalog,
} from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// EV-73, P8-09, RF-645, RF-608, DEC-184: the web path to the Plan setup save of a typed architecture.
// The page saves the typed text together with the styles Rosetta proposed and the cards behind its
// recommended one, so the decision record of the own answer can name the recommendation ("Rosetta made
// no recommendation" was the bug). The fake planner proposes the options of plan-options.json.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('plan', info.project.name));
});

test('EV-73 RF-645 a typed architecture answer is saved with the recommendation next to the text', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await understandCatalog(page);
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Architecture');
  await expectOptions(page);
  await page.getByRole('radio', { name: /^Type your own answer/u }).check();
  await page.getByRole('textbox', { name: 'Your answer' }).fill('Cells, one per region.');

  const sent = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/planning-brief'),
  );
  await page.getByRole('button', { name: 'Save and continue' }).click();
  const answers = (await sent).postDataJSON() as {
    architecture?: { style: string; recommended: string[]; evidence: string[] };
    typed?: Record<string, string>;
  };

  expect(answers.typed?.['architecture']).toBe('Cells, one per region.');
  expect(answers.architecture?.recommended.length).toBeGreaterThan(0);
  expect(answers.architecture?.style).toBe(answers.architecture?.recommended[0]);
  await expect(recorded(page)).toContainText('Your own answer: Cells, one per region.');

  // The saved brief keeps the recommendation after a reload.
  const read = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' && response.url().endsWith('/planning-brief'),
  );
  await page.reload();
  const saved = (await (await read).json()) as {
    brief: { architecture: { recommended: string[] } };
  };
  expect(saved.brief.architecture.recommended.length).toBeGreaterThan(0);
});
