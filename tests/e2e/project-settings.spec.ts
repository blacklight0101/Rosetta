import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-002, DEC-116, DEC-117, P1-41: the settings page of a project. It shows the defaults as built,
// shows the server's refusals next to their fields with the code (an empty model, a negative cap)
// and keeps what was saved across a reload. The numbers are plain number fields. The account
// belongs to the project (seed.ts); the project is made through the projects page, and the steps
// run in order because they share it.

const demoUrl = 'https://github.com/octo/demo';

test.describe.configure({ mode: 'serial' });

async function openSettings(page: Page): Promise<void> {
  await page.goto('/projects');
  const link = page.getByRole('link', { name: 'Settings for octo/demo' });
  const empty = page.getByText('No projects yet');
  await expect(link.or(empty)).toBeVisible();
  if (await empty.isVisible()) {
    await page.getByLabel('GitHub repository URL').fill(demoUrl);
    await page.getByRole('button', { name: 'Create project' }).click();
  }
  await link.click();
  await expect(page.getByRole('heading', { name: 'Project settings' })).toBeVisible();
  await expect(page.getByLabel('Reader model', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('project-settings', info.project.name));
  await openSettings(page);
});

test('RF-002 shows the settings a new project starts with and passes axe', async ({ page }) => {
  await expect(page.getByLabel('Reader model', { exact: true })).toHaveValue('gemma4:e4b');
  await expect(page.getByLabel('Run cost cap (USD)', { exact: true })).toHaveValue('0.50');
  await expect(page.getByLabel('Run token cap', { exact: true })).toHaveValue('2000000');
  await expect(page.getByLabel('Parallel readers', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Run token cap', { exact: true })).toHaveAttribute('type', 'number');
  await expectNoSeriousViolations(page);
});

test('RF-002 shows each refusal next to its field with the code and saves nothing', async ({
  page,
}) => {
  const model = page.getByLabel('Reader model', { exact: true });
  const tokens = page.getByLabel('Run token cap', { exact: true });
  await model.fill('');
  await tokens.fill('-1');

  await page.getByRole('button', { name: 'Save settings' }).click();

  await expect(page.getByTestId('field-error').filter({ hasText: 'RST-1002' })).toBeVisible();
  await expect(page.getByTestId('field-error').filter({ hasText: 'RST-1003' })).toBeVisible();
  await expect(model).toHaveAttribute('aria-invalid', 'true');
  await expect(model).toBeFocused();
  await expect(tokens).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Settings saved.')).toHaveCount(0);
  await expectNoSeriousViolations(page);
  await page.reload();
  await expect(page.getByLabel('Reader model', { exact: true })).toHaveValue('gemma4:e4b');
});

test('RF-002 saves changed settings and shows them again after a reload', async ({ page }) => {
  await page.getByLabel('Reader model', { exact: true }).fill('gemma4:e2b');
  await page.getByLabel('Run cost cap (USD)', { exact: true }).fill('1.25');
  // P2-26: the away-from-default warning is on the page while it is checked for accessibility.
  await expect(page.getByText(/^Differs from the default of \$0\.50\./u)).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.getByRole('button', { name: 'Save settings' }).click();

  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Reader model', { exact: true })).toHaveValue('gemma4:e2b');
  await expect(page.getByLabel('Run cost cap (USD)', { exact: true })).toHaveValue('1.25');
  await expectNoSeriousViolations(page);
});

// RF-405, DEC-156: the model of each role is chosen from the provider's list (these are the last
// steps, so the models saved by the steps above are already checked).
test('RF-405 chooses the Reader model from the Anthropic list, then from Other model...', async ({
  page,
}) => {
  await page.getByLabel('Reader provider', { exact: true }).selectOption('anthropic');
  const model = page.getByLabel('Reader model', { exact: true });
  await expect(model).toHaveJSProperty('tagName', 'SELECT');
  await expect(model).toHaveValue('');

  await model.selectOption('claude-haiku-5-5');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Reader model', { exact: true })).toHaveValue('claude-haiku-5-5');
  await expectNoSeriousViolations(page);

  await page.getByLabel('Reader model', { exact: true }).selectOption({ label: 'Other model...' });
  await page.getByLabel('Reader other model').fill('claude-haiku-4-5');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Reader model', { exact: true })).toHaveValue('__other__');
  await expect(page.getByLabel('Reader other model')).toHaveValue('claude-haiku-4-5');
  await expectNoSeriousViolations(page);
});

test('RF-405 lists the models installed on Ollama in the project settings', async ({ page }) => {
  await page.route('**/api/models/ollama', (route) =>
    route.fulfill({
      json: {
        provider: 'ollama',
        models: [{ model: 'qwen3:8b', label: 'qwen3:8b', priced: true }],
      },
    }),
  );
  await page.getByLabel('Reader provider', { exact: true }).selectOption('ollama');

  const model = page.getByLabel('Reader model', { exact: true });
  await expect(model.locator('option', { hasText: 'qwen3:8b' })).toBeAttached();
  await model.selectOption('qwen3:8b');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
});
