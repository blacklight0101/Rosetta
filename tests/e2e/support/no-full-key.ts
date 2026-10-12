import { expect, type Page } from '@playwright/test';

// RF-1104: a saved key never comes back. After any step the page must hold only its last four
// characters: not in the text, the markup, a form value, the browser storage or the key list the
// server answers. The fixture keys are built from pieces at run time (RNF-003).

/** A key-shaped fixture value that ends in the given four characters; `tag` tells the keys apart. */
export function fixtureKeyEndingIn(tag: string, last4: string): string {
  return ['fixture', tag, 'material', 'of', 'a', 'key', last4].join('-');
}

/** Fails when the page or the server's key list holds any of the keys. */
export async function expectNoFullKey(page: Page, keys: readonly string[]): Promise<void> {
  const holders = await page.evaluate(async () => {
    const answer = await fetch('/api/account/keys');
    const values = Array.from(document.querySelectorAll('input, textarea'), (field) =>
      field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : '',
    );
    return {
      text: document.body.innerText,
      values: values.join('\n'),
      storage: JSON.stringify([
        Object.entries(window.localStorage),
        Object.entries(window.sessionStorage),
      ]),
      list: await answer.text(),
      title: document.title,
    };
  });
  const everywhere = { ...holders, markup: await page.content() };
  for (const key of keys) {
    for (const [where, content] of Object.entries(everywhere)) {
      expect(content, `${where} must not hold the key`).not.toContain(key);
    }
  }
}
