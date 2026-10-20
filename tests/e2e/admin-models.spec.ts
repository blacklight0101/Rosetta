import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// DEC-106, P1-42: the default models per role for new projects. The administrator picks a provider
// and a model for a role, saves, and finds them again after a reload; a role left on "Template
// default" keeps the template's model. Every project saves the same values, as they share the
// server setting.

// The default models are one server setting, so the steps of this file run in order.
test.describe.configure({ mode: 'serial' });

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

// RF-405, RF-427, DEC-156: the model of a role is chosen from the provider's list. These tests use
// the summariser only and give it back to "Template default" when they end, because the default
// models are one server setting shared with the tests above.

const saveButton = (page: Page) => page.getByRole('button', { name: 'Save default models' });

async function giveBackSummariser(page: Page): Promise<void> {
  await page.getByLabel('Summariser provider').selectOption('');
  await saveButton(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'Default models saved' })).toBeVisible();
}

const optionTexts = (select: Locator): Promise<string[]> =>
  select.locator('option').allTextContents();

test('RF-405 lists the Anthropic models without a price, keeps the choice and passes axe', async ({
  page,
}) => {
  await page.getByLabel('Summariser provider').selectOption('anthropic');
  const model = page.getByLabel('Summariser model', { exact: true });
  await expect(model).toHaveJSProperty('tagName', 'SELECT');

  expect(await optionTexts(model)).toEqual([
    'Choose a model',
    'Claude Opus 5.5 (no price)',
    'Claude Sonnet 5.5 (no price)',
    'Claude Haiku 5.5 (no price)',
    'Claude Fable 5.1 (no price)',
    'Other model...',
  ]);
  await model.selectOption('claude-sonnet-5-5');
  await expect(page.getByText(/has no price in the price table/u)).toBeVisible();
  await expectNoSeriousViolations(page);
  await saveButton(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'Default models saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Summariser model', { exact: true })).toHaveValue(
    'claude-sonnet-5-5',
  );

  await giveBackSummariser(page);
});

test('RF-405 lists the priced OpenAI models and saves free text under Other model...', async ({
  page,
}) => {
  await page.getByLabel('Summariser provider').selectOption('openai');
  const model = page.getByLabel('Summariser model', { exact: true });

  await expect(model).toHaveJSProperty('tagName', 'SELECT');
  await expect(model.locator('option', { hasText: 'GPT-5 nano' }).first()).toBeAttached();
  expect(await optionTexts(model)).not.toContain('GPT-5 nano (no price)');
  await model.selectOption({ label: 'Other model...' });
  const other = page.getByLabel('Summariser other model');
  await expect(other).toBeFocused();
  await other.fill('gpt-6-preview');
  await expectNoSeriousViolations(page);
  await saveButton(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'Default models saved' })).toBeVisible();
  await page.reload();

  await expect(page.getByLabel('Summariser model', { exact: true })).toHaveValue('__other__');
  await expect(page.getByLabel('Summariser other model')).toHaveValue('gpt-6-preview');
  await giveBackSummariser(page);
});

test('RF-405 changing the provider clears the model choice', async ({ page }) => {
  await page.getByLabel('Summariser provider').selectOption('anthropic');
  const model = page.getByLabel('Summariser model', { exact: true });
  await expect(model).toHaveJSProperty('tagName', 'SELECT');
  await model.selectOption('claude-opus-5-5');

  await page.getByLabel('Summariser provider').selectOption('openai');

  await expect(page.getByLabel('Summariser model', { exact: true })).toHaveValue('');
  await page.getByLabel('Summariser provider').selectOption('');
});

test('RF-405 the model select works from the keyboard', async ({ page }) => {
  await page.getByLabel('Summariser provider').selectOption('anthropic');
  const model = page.getByLabel('Summariser model', { exact: true });
  await expect(model).toHaveJSProperty('tagName', 'SELECT');

  await model.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');

  await expect(model).toHaveValue('claude-sonnet-5-5');
  await page.getByLabel('Summariser provider').selectOption('');
});

test('RF-405 lists the models installed on Ollama and saves one', async ({ page }) => {
  await page.route('**/api/models/ollama', (route) =>
    route.fulfill({
      json: {
        provider: 'ollama',
        models: [
          { model: 'gemma4:e4b', label: 'gemma4:e4b', priced: true },
          { model: 'qwen3:8b', label: 'qwen3:8b', priced: true },
        ],
      },
    }),
  );
  await page.getByLabel('Summariser provider').selectOption('ollama');
  const model = page.getByLabel('Summariser model', { exact: true });

  await expect(model).toHaveJSProperty('tagName', 'SELECT');
  expect(await optionTexts(model)).toEqual([
    'Choose a model',
    'gemma4:e4b',
    'qwen3:8b',
    'Other model...',
  ]);
  await model.selectOption('qwen3:8b');
  await saveButton(page).click();

  await expect(page.getByRole('status').filter({ hasText: 'Default models saved' })).toBeVisible();
  await giveBackSummariser(page);
});

test('RF-405 Ollama that cannot be reached leaves the text field and a note, and saving works', async ({
  page,
}) => {
  await page.getByLabel('Summariser provider').selectOption('ollama');

  const model = page.getByLabel('Summariser model', { exact: true });
  await expect(page.locator('#default-summariser-model-help')).toContainText(
    'Ollama could not be reached. Type the model id',
  );
  await expect(model).toHaveJSProperty('tagName', 'INPUT');
  await model.fill('gemma4:e4b');
  await expectNoSeriousViolations(page);
  await saveButton(page).click();

  await expect(page.getByRole('status').filter({ hasText: 'Default models saved' })).toBeVisible();
  await giveBackSummariser(page);
});

test('RF-405 the choice fits a 360 px screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.getByLabel('Summariser provider').selectOption('anthropic');
  const model = page.getByLabel('Summariser model', { exact: true });
  await expect(model).toHaveJSProperty('tagName', 'SELECT');
  await model.selectOption({ label: 'Other model...' });

  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

  expect(fits).toBe(true);
  await page.getByLabel('Summariser provider').selectOption('');
});
