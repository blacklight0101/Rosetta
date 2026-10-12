import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-010, RF-1105, DEC-70, P1-41: the projects page. A user pastes a public GitHub URL (the test
// server's fake GitHub answers for octo/demo; creating a project only reads the address), sees the
// project in a list that is theirs alone, gets the refusal next to the field for an address that is
// not a GitHub repository, and is taken to the existing project when the same address is created
// again. The account belongs to the project (seed.ts), and the steps run in order because they
// share its projects.

const demoUrl = 'https://github.com/octo/demo';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('projects', info.project.name));
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
});

test('RF-010 starts with no project, offers the demo repository and passes axe', async ({
  page,
}) => {
  await expect(page.getByText('No projects yet')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  await page.getByRole('button', { name: 'Use the demo repository' }).click();

  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(/eShopModernizing/u);
  await expectNoSeriousViolations(page);
});

test('RF-010 refuses an address that is not a GitHub repository next to the field', async ({
  page,
}) => {
  const url = page.getByLabel('GitHub repository URL');
  await url.fill('https://example.com/octo/demo');

  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByTestId('field-error').filter({ hasText: 'RST-1900' })).toBeVisible();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await expect(url).toBeFocused();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('RF-010 creates a project from a GitHub URL and lists it', async ({ page }) => {
  await page.getByLabel('GitHub repository URL').fill(demoUrl);

  await page.getByRole('button', { name: 'Create project' }).click();

  const row = page.getByRole('row').filter({ hasText: 'octo/demo' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('default branch');
  await expect(page.getByRole('status').filter({ hasText: 'Created octo/demo' })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'octo/demo' })).toHaveCount(1);
  await expectNoSeriousViolations(page);
});

test('RF-010 creating the same address again opens the existing project', async ({ page }) => {
  await page.getByLabel('GitHub repository URL').fill(demoUrl);

  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page).toHaveURL(/\/projects\/[^/]+\/settings$/u);
  await expect(page.getByRole('heading', { name: 'Project settings' })).toBeVisible();
  await expect(page.getByText('octo/demo')).toBeVisible();
  await page.goto('/projects');
  await expect(page.getByRole('row').filter({ hasText: 'octo/demo' })).toHaveCount(1);
});
