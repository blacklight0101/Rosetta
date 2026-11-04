import { expect, type Page } from '@playwright/test';

// RF-436, P8-56: saving Project settings with the reader moved from Ollama to a hosted provider
// raises a stored parallelism of 1 to the template's 4. A journey whose cap must be reached by the
// first reader call alone (the later calls are refused only after it was answered and metered)
// saves the provider first, then sets one reader at a time in a second save: a value sent with no
// provider change is kept.

/** Saves the open Project settings and waits until the server has answered the save. */
async function saveAndWaitForAnswer(page: Page): Promise<void> {
  const answered = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && response.url().endsWith('/settings'),
  );
  await page.getByRole('button', { name: 'Save settings' }).click();
  expect((await answered).ok()).toBe(true);
}

/**
 * On Project settings with the reader provider already changed to a hosted one in the form: saves
 * that (the rule makes it 4 readers), then saves one parallel reader.
 */
export async function saveHostedReaderWithOneParallelReader(page: Page): Promise<void> {
  const readers = page.getByLabel('Parallel readers', { exact: true });
  await saveAndWaitForAnswer(page);
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.reload();
  await expect(readers).toHaveValue('4');
  await readers.fill('1');
  await saveAndWaitForAnswer(page);
  await page.reload();
  await expect(readers).toHaveValue('1');
}

/**
 * P8-132: on Project settings with the reader provider already changed to a hosted one in the form:
 * saves that and keeps the four parallel readers the rule makes of it, for a journey that proves the
 * cap at four readers (the readers' room counts the calls in flight, RF-429).
 */
export async function saveHostedReaderWithFourParallelReaders(page: Page): Promise<void> {
  const readers = page.getByLabel('Parallel readers', { exact: true });
  await saveAndWaitForAnswer(page);
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.reload();
  await expect(readers).toHaveValue('4');
}
