import type { Page } from '@playwright/test';

// RF-405, DEC-156: sets the model of a role on the Default models page or in the project settings.
// The model is a select of the provider's list when there is one: a listed model is picked, any
// other goes under "Other model...". With no list (Ollama unreachable) it is the plain text field.
// The provider is chosen first: changing it clears the model.

export async function chooseModel(
  page: Page,
  role: 'Reader' | 'Verifier' | 'Planner' | 'Summariser',
  model: string,
): Promise<void> {
  const control = page.getByLabel(`${role} model`, { exact: true });
  const tag = await control.evaluate((element) => element.tagName);
  if (tag !== 'SELECT') {
    await control.fill(model);
    return;
  }
  const listed = await control
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option instanceof HTMLOptionElement ? option.value : '')),
    );
  if (listed.includes(model)) {
    await control.selectOption(model);
    return;
  }
  await control.selectOption({ label: 'Other model...' });
  await page.getByLabel(`${role} other model`, { exact: true }).fill(model);
}
