import { expect, type Page } from '@playwright/test';

// RF-405, DEC-156: sets the model of a role on the Default models page or in the project settings.
// The model is a select of the provider's list when there is one: a listed model is picked, any
// other goes under "Other model...". With no list (Ollama unreachable) it is the plain text field.
// The provider is chosen first (changing it clears the model); the helper then waits until the list
// has arrived or the note about the missing list is shown, so it never types into a field that is
// about to become a select.

export async function chooseModel(
  page: Page,
  role: 'Reader' | 'Verifier' | 'Planner' | 'Summariser',
  model: string,
): Promise<void> {
  const control = page.getByLabel(`${role} model`, { exact: true });
  await expect
    .poll(() =>
      control.evaluate(
        (element) => element.tagName === 'SELECT' || element.hasAttribute('aria-describedby'),
      ),
    )
    .toBe(true);
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

// Q-57: a role the project gives no output limit takes the default of its model (16,000 for the
// reader of a hosted model). Specs whose figures depend on the small limits of the Ollama defaults
// (a cap of a fraction of a cent) set them here, so what they check is the cap and not the model.
export async function setOutputLimit(
  page: Page,
  role: 'Reader' | 'Verifier' | 'Planner' | 'Summariser',
  tokens: number,
): Promise<void> {
  await page.getByLabel(`${role} max output tokens`, { exact: true }).fill(String(tokens));
}
