import type { Page } from '@playwright/test';
import { expect } from './fixtures.js';

// RF-507, RNF-003, P1-49 F-08: the hostile card of the recorded run (tests/fixtures/runs/replay-demo)
// holds a `<script>` element, an `onerror` image, a `javascript:` link and an `svg` payload in its
// text. A page that shows it must show it as text: nothing runs, no dialog opens and no element of
// the payload exists. Each payload would set `window.__pwned` or open a dialog if it ran.

/** The snippets of the hostile card that must be visible as text. */
export const hostileTexts = {
  script: "<script>window.__pwned = 'script'</script>",
  image: 'onerror="window.__pwned',
  link: "(javascript:window.__pwned='link')",
  svg: '<svg onload="window.__pwned=',
} as const;

/** Records the dialogs the page opens (an `alert` from a payload would be one) and dismisses them. */
export function watchDialogs(page: Page): string[] {
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  return dialogs;
}

/** No payload ran and none of its elements exists: the page holds them as text only. */
export async function expectNothingInjected(page: Page, dialogs: readonly string[]): Promise<void> {
  expect(await page.evaluate<unknown>('globalThis.__pwned')).toBeUndefined();
  expect(dialogs).toEqual([]);
  const handlers = '[onerror], [onload], [onclick], [onmouseover], [onfocus], [onmouseenter]';
  await expect(page.locator(handlers)).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:" i], [src^="javascript:" i]')).toHaveCount(0);
  await expect(page.locator('img[src="x"], img[onerror], svg[onload], svg script')).toHaveCount(0);
  await expect(page.locator('iframe, object, embed, b:text-is("checkout")')).toHaveCount(0);
  const scriptsWithPayload = await page.evaluate<number>(
    "[...document.scripts].filter((script) => (script.textContent ?? '').includes('__pwned')).length",
  );
  expect(scriptsWithPayload).toBe(0);
}
