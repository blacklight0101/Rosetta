import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';
import { openStartPage } from './support/live-run-page.js';
import {
  openPlanSetup,
  openStep,
  understandCatalog,
  understandInventory,
} from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-609, DEC-208 (P8-21): the Stack step follows the language and runtime chosen. The spec has a
// file of its own and depends on no state saved by another spec.

// P8-104: this walk runs on the seeded Python project `octo/inventory`, which is not .NET, under its
// own account, so the .NET options are offered because C# on .NET was picked and not because the
// project is .NET.
test('RF-609 DEC-208 picking C# on .NET on a non-.NET project offers ASP.NET Core Razor Pages, SQL Server, Dapper and xUnit', async ({
  page,
  context,
}, info) => {
  test.setTimeout(240_000);
  await signInAs(context, accountFor('plan-non-dotnet', info.project.name));
  await understandInventory(page);
  await openPlanSetup(page);
  await openStep(page, 'Stack');

  const language = page.getByRole('radiogroup', { name: 'Language and runtime' });
  // The Python project offers Python and TypeScript, so C# on .NET is the owner's own answer (RF-609).
  await expect(language.getByRole('radio', { name: /^C# on .NET/u })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Back-end framework' })).toContainText(
    'FastAPI',
  );
  await language.getByRole('radio', { name: 'Type your own answer' }).check();
  await page.getByLabel('Your answer for Language and runtime').fill('C# on .NET');

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
  context,
}, info) => {
  test.setTimeout(240_000);
  await signInAs(context, accountFor('plan', info.project.name));
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
