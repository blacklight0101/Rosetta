import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';

// RF-1003, RF-1010, P8-101: what the header looks like now, read in the page for header-run-meter.spec.ts.

const headerShapeSchema = z.object({
  /** Height of the header, in px. */
  height: z.number(),
  /** Vertical spread of the centres of the parts of the header that share the first row, in px. */
  spread: z.number(),
  /** Texts or controls that break over two lines. */
  broken: z.array(z.string()),
  /** Texts of the user's name, role, Sign out and the theme toggle that break over two lines. */
  accountBroken: z.array(z.string()),
  /** Vertical spread of the user's name, role, Sign out and the theme toggle. */
  accountSpread: z.number(),
  /** The page, or the header itself, is wider than the window. */
  sideways: z.boolean(),
  /** Sign out, the role and the theme toggle cannot be squeezed or broken: no wrap and no shrink. */
  accountRigid: z.boolean(),
  /** The account group ends past the right edge of the window. */
  accountOutside: z.boolean(),
  /** The user's name is cut: its text is wider than its box. */
  nameCut: z.boolean(),
  nameText: z.string(),
  nameTitle: z.string(),
  nameEllipsis: z.boolean(),
  /** The input, output and cached split of the pill is on screen. */
  splitShown: z.boolean(),
  /** The server figure of the pill is on screen. */
  serverShown: z.boolean(),
  /** The tooltip of the totals pill (its own figures). */
  totalsTitle: z.string(),
  /** The width of each part of the header, for the message of a failure. */
  widths: z.array(z.string()),
  /** True when the run meter is on a row of its own under the wordmark. */
  meterBelow: z.boolean(),
  /** True when the run meter stands on the first row between the wordmark and the totals. */
  meterAfterWordmark: z.boolean(),
});
export type HeaderShape = z.infer<typeof headerShapeSchema>;

const READ_HEADER = `(() => {
    const header = document.querySelector('header.rst-header');
    const leaves = (root) => Array.from(root.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && el.getBoundingClientRect().width > 0 && !el.hasAttribute('hidden'));
    const centres = (list) => list.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    const spread = (list) => { const c = centres(list); return c.length === 0 ? 0 : Math.max(...c) - Math.min(...c); };
    const meter = header.querySelector('[data-testid="topbar-run-meter"]');
    const wordmark = header.querySelector('.rst-wordmark');
    const account = header.querySelector('.rst-header__account');
    const name = header.querySelector('.rst-header__name') || header.querySelector('[data-testid="header-user"] > span');
    const shown = (selector) => { const el = header.querySelector(selector); return el !== null && el.getBoundingClientRect().width > 0; };
    const below = meter !== null && meter.getBoundingClientRect().top >= wordmark.getBoundingClientRect().bottom;
    const row = Array.from(header.children).filter((el) => el.getBoundingClientRect().width > 0 && !(below && el === meter));
    const accountLeaves = leaves(account);
    const lines = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top / 4))).size;
    };
    const textOf = (el) => (el.textContent || '').trim();
    const brokenOf = (list) => list.filter((el) => textOf(el) !== '' && lines(el) > 1).map(textOf);
    const totals = header.querySelector('.rst-header__totals .rst-p136-pill__own');
    return {
      height: header.getBoundingClientRect().height,
      spread: spread(row),
      broken: brokenOf(leaves(header)),
      accountBroken: brokenOf(accountLeaves),
      accountSpread: spread(accountLeaves),
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth
        || header.scrollWidth > header.clientWidth,
      accountRigid: Array.from(account.querySelectorAll('button, .rst-badge')).every((el) => {
        const style = getComputedStyle(el);
        return style.whiteSpace === 'nowrap' && style.flexShrink === '0';
      }),
      accountOutside: account.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5,
      nameCut: name.scrollWidth > name.clientWidth,
      nameText: textOf(name),
      nameTitle: name.getAttribute('title') || '',
      nameEllipsis: getComputedStyle(name).textOverflow === 'ellipsis',
      splitShown: shown('.rst-p136-pill__split'),
      serverShown: shown('.rst-p136-pill__server'),
      totalsTitle: totals === null ? '' : totals.getAttribute('title') || '',
      meterBelow: below,
      meterAfterWordmark: meter !== null && !below
        && meter.getBoundingClientRect().left >= wordmark.getBoundingClientRect().right
        && (totals === null || meter.getBoundingClientRect().right <= totals.getBoundingClientRect().left),
      widths: Array.from(header.children).map((el) => (el.className || el.tagName) + ' ' + Math.round(el.getBoundingClientRect().width) + ' ' + Math.round(el.getBoundingClientRect().top)),
    };
  })()`;

/** Reads the header in the page (a string, as the project has no DOM types). */
export async function headerShape(page: Page): Promise<HeaderShape> {
  const shape: unknown = await page.evaluate(READ_HEADER);
  return headerShapeSchema.parse(shape);
}

/** Where an element is in the viewport. */
export async function boxOf(locator: Locator): Promise<{ y: number; height: number }> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { y: rect.y, height: rect.height };
  });
}

/**
 * Makes the run meter as long as it gets: the note it shows from 80% of the cap and more digits in
 * its figures. The nodes are added beside the ones the page draws, so a new reading does not undo them.
 */
export async function lengthenMeter(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const meter = document.querySelector('[data-testid="topbar-run-meter"]');
    const figures = meter.querySelector('.rst-topbar-runmeter-figures');
    const digits = document.createElement('span');
    digits.textContent = '9,999,999';
    figures.append(digits);
    const note = document.createElement('span');
    note.className = 'rst-topbar-runmeter-note';
    note.textContent = 'Approaching the cap';
    meter.append(note);
  })()`);
}
