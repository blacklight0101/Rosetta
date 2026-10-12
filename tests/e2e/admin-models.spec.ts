import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// DEC-106, P1-42: the default models per role for new projects. The administrator picks a provider
// and a model for a role, saves, and finds them again after a reload; a role left on "Template
// default" keeps the template's model. Every project saves the same values, as they share the
// server setting.

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('admin', info.project.name));
  await page.goto('/admin/models');
  await expect(page.getByRole('heading', { name: 'Default models', level: 1 })).toBeVisible();
});

test('DEC-106 saves the default model of a role and shows it after a reload', async ({ page }) => {
  await page.getByLabel('Reader provider').selectOption('ollama');
  await page.getByLabel('Reader model').fill('gemma4:e4b');

  await page.getByRole('button', { name: 'Save default models' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Default models saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Reader provider')).toHaveValue('ollama');
  await expect(page.getByLabel('Reader model')).toHaveValue('gemma4:e4b');
  await expect(page.getByLabel('Planner provider')).toHaveValue('');
  await expectNoSeriousViolations(page);
});

test('DEC-106 asks for a model when a provider is chosen without one', async ({ page }) => {
  await page.getByLabel('Verifier provider').selectOption('openai');
  await page.getByLabel('Verifier model').fill('');

  await page.getByRole('button', { name: 'Save default models' }).click();

  await expect(page.getByLabel('Verifier model')).toHaveAttribute('aria-invalid', 'true');
});
