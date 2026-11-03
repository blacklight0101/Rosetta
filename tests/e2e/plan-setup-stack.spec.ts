import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';
import { openStartPage } from './support/live-run-page.js';
import { openPlanSetup, openStep, understandCatalog } from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-609, DEC-208 (P8-21): the Stack step follows the language and runtime chosen. The spec has a
// file of its own and depends on no state saved by another spec.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('plan', info.project.name));
});

// The e2e harness has no non-.NET project (its scan is the .NET demo), so this walk picks C# on .NET
// on the demo and checks the .NET options by name; the Java test below proves the layers change.
test('RF-609 DEC-208 picking C# on .NET offers ASP.NET Core Razor Pages, SQL Server, Dapper and xUnit', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await understandCatalog(page);
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Stack');

  const language = page.getByRole('radiogroup', { name: 'Language and runtime' });
  await language.getByRole('radio', { name: /^C# on .NET/u }).check();

  await expect(
    page.getByText('The layers below suggest technologies for C# on .NET.'),
  ).toBeVisible();
  const offered: Record<string, string> = {
    'Back-end framework': 'ASP.NET Core Razor Pages (Recommended)',
    Database: 'SQL Server (Recommended)',
    'Data access': 'Dapper (Recommended)',
    Testing: 'xUnit (Recommended)',
  };
  for (const [layer, title] of Object.entries(offered)) {
    const group = page.getByRole('radiogroup', { name: layer });
    await expect(group.getByRole('radio', { name: title })).toBeVisible();
  }
  await expectNoSeriousViolations(page);
});

test('RF-609 DEC-208 the stack layers follow a language that is not the legacy one', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await understandCatalog(page);
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Stack');

  // The demo is .NET; typing Java as the language makes every layer below suggest the JVM ecosystem.
  const language = page.getByRole('radiogroup', { name: 'Language and runtime' });
  await language.getByRole('radio', { name: 'Type your own answer' }).check();
  await page.getByLabel('Your answer for Language and runtime').fill('Java');

  await expect(page.getByText('The layers below suggest technologies for Java.')).toBeVisible();
  const backend = page.getByRole('radiogroup', { name: 'Back-end framework' });
  await expect(backend.getByRole('radio', { name: 'Spring Boot (Recommended)' })).toBeVisible();
  const testing = page.getByRole('radiogroup', { name: 'Testing' });
  await expect(testing.getByRole('radio', { name: 'JUnit 5 (Recommended)' })).toBeVisible();
  await expectNoSeriousViolations(page);
});
