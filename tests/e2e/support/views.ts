import type { Page, TestInfo } from '@playwright/test';
import { z } from 'zod';
import { transitionsDone } from './transitions.js';

// RNF-010, architecture.md section 17: the four views of the page walk (orchestration README
// section 1), which are also the four Playwright projects of playwright.config.ts: 1280x800 for the
// web UI and 360x780 for the landing page, sign-in and report, each in the light and the dark
// colour scheme. Behavioural tests run once, in desktop-light; an accessibility check they make
// there is repeated in the other three views on the same page, in the same state (`inEveryView`).

export const behaviouralProject = 'desktop-light';

/** The tag of a test that runs in all four projects (the visual sweep). */
export const visualTag = '@visual';

/** The tag of a test about the 360 px layout, which runs in phone-light as well. */
export const phoneTag = '@phone';

export const views = [
  { name: 'desktop-light', viewport: { width: 1280, height: 800 }, colorScheme: 'light' },
  { name: 'desktop-dark', viewport: { width: 1280, height: 800 }, colorScheme: 'dark' },
  { name: 'phone-light', viewport: { width: 360, height: 780 }, colorScheme: 'light' },
  { name: 'phone-dark', viewport: { width: 360, height: 780 }, colorScheme: 'dark' },
] as const;

export type View = (typeof views)[number];

/** Each view switch changes the layout or the theme once, so the walk moves through them in turn. */
const walk: readonly View[] = [views[0], views[1], views[3], views[2]];

/** What one walk of the four views may add to the test's budget (four scans and three switches). */
const walkBudgetMs = 20_000;

const scrollPosition = z.tuple([z.number(), z.number()]);

/** True for the one run of a behavioural test: its checks are then made in every view. */
export function checksEveryView(info: TestInfo): boolean {
  return info.project.name === behaviouralProject && !info.tags.includes(visualTag);
}

/** Lets the page apply a new viewport or colour scheme, and its colour transitions finish. */
async function settle(page: Page): Promise<void> {
  // A string, because the end-to-end project is compiled without the DOM types.
  await page.evaluate(
    'new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(undefined))))',
  );
  await transitionsDone(page);
}

const shownView = z.object({
  width: z.number(),
  prefersDark: z.boolean(),
  theme: z.string().nullable(),
});

/**
 * Fails, naming what the page shows, unless the page now has the view: its width, the colour scheme
 * of the media query and, on a page the front end draws, `data-theme` (a theme saved by a test, or
 * a theme read only at load, would leave it behind).
 */
async function expectShown(page: Page, view: ShownView): Promise<void> {
  const shown = shownView.parse(
    await page.evaluate(`({
      width: window.innerWidth,
      prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      theme: document.documentElement.getAttribute('data-theme'),
    })`),
  );
  const dark = view.colorScheme === 'dark';
  const themeFollows = shown.theme === null || shown.theme === view.colorScheme;
  if (shown.width === view.viewport.width && shown.prefersDark === dark && themeFollows) return;
  const scheme = shown.prefersDark ? 'dark' : 'light';
  throw new Error(
    `The ${view.name} view did not take effect on ${page.url()}: width ${String(shown.width)}, ` +
      `prefers-color-scheme ${scheme}, data-theme ${String(shown.theme)}`,
  );
}

interface ShownView {
  readonly name: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly colorScheme: string;
}

async function show(page: Page, view: ShownView): Promise<void> {
  await page.setViewportSize(view.viewport);
  await page.emulateMedia({ colorScheme: view.colorScheme === 'dark' ? 'dark' : 'light' });
  await settle(page);
  await expectShown(page, view);
}

/**
 * Runs `check` on the page as it is now in each of the four views, then puts the page back in the
 * project's own view and scroll position, so the test goes on exactly where it was. The page's own
 * theme follows `prefers-color-scheme` as it changes (use-theme.ts) and its layout is CSS only.
 */
// RNF-010
export async function inEveryView(
  page: Page,
  info: TestInfo,
  check: (view: View) => Promise<void>,
): Promise<void> {
  if (info.timeout > 0) info.setTimeout(info.timeout + walkBudgetMs);
  const viewport = page.viewportSize() ?? views[0].viewport;
  const colorScheme = info.project.use.colorScheme ?? 'light';
  const [x, y] = scrollPosition.parse(await page.evaluate('[window.scrollX, window.scrollY]'));
  // The page's running CSS animations (the landing page's replay) hold still during the walk, so
  // every view shows the frame the test reached, not a later one.
  await page.evaluate(`globalThis.rstHeldAnimations = document.getAnimations()
    .filter((each) => each instanceof CSSAnimation && each.playState === 'running');
    globalThis.rstHeldAnimations.forEach((each) => each.pause());`);
  try {
    for (const view of walk) {
      await show(page, view);
      await check(view);
    }
  } finally {
    await show(page, { name: info.project.name, viewport, colorScheme });
    await page.evaluate(`window.scrollTo(${String(x)}, ${String(y)});
      (globalThis.rstHeldAnimations ?? []).forEach((each) => each.play());`);
  }
}
