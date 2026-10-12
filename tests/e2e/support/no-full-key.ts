import { expect, type Page } from '@playwright/test';

// RF-1104: a saved key never comes back. After any step the page must hold only its last four
// characters: not in the text, the markup, a form value, the browser storage or the key list the
// server answers. The fixture keys are built from pieces at run time (RNF-003).

/** A key-shaped fixture value that ends in the given four characters; `tag` tells the keys apart. */
export function fixtureKeyEndingIn(tag: string, last4: string): string {
  return ['fixture', tag, 'material', 'of', 'a', 'key', last4].join('-');
}

async function fieldValues(page: Page): Promise<string> {
  const fields = page.locator('input, textarea');
  const values: string[] = [];
  for (let index = 0; index < (await fields.count()); index += 1) {
    values.push(await fields.nth(index).inputValue());
  }
  return values.join('\n');
}

async function storageText(page: Page): Promise<string> {
  const stored: unknown = await page.evaluate(
    'JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)])',
  );
  return String(stored);
}

/**
 * Fails when the page or the server's key list holds any of the keys. A key in `stillTyped` may
 * sit in a form field (a refused save keeps what was typed so it can be fixed), nowhere else.
 */
export async function expectNoFullKey(
  page: Page,
  keys: readonly string[],
  stillTyped: readonly string[] = [],
): Promise<void> {
  const list = await page.request.get('/api/account/keys');
  const holders = {
    text: await page.locator('body').innerText(),
    markup: await page.content(),
    values: await fieldValues(page),
    storage: await storageText(page),
    title: await page.title(),
    list: await list.text(),
  };
  for (const key of keys) {
    for (const [where, content] of Object.entries(holders)) {
      if (where === 'values' && stillTyped.includes(key)) continue;
      expect(content, `${where} must not hold the key`).not.toContain(key);
    }
  }
}
