import type { Page } from '@playwright/test';

// RNF-010: a colour that is still moving from one value to the next fails a contrast check by
// accident. This waits for the page's CSS transitions (a button that has just been enabled, a link
// that has just become current) to finish before axe reads the colours.
// Which test needs it: the sign-in check of smoke.spec.ts on phone-dark, where the Sign in button's
// background-color transition is still running when `data-theme` turns dark (seen on every load).
// The contrast failure it prevents shows only when axe runs mid-fade, on a slow or loaded runner,
// so no committed test fails without the wait; the journeys call it before axe for the same reason.

/** Resolves when every running CSS transition of the page has finished. */
export async function transitionsDone(page: Page): Promise<void> {
  // A string, because the end-to-end project is compiled without the DOM types.
  await page.evaluate(
    `Promise.allSettled(
      document.getAnimations()
        .filter((each) => each instanceof CSSTransition)
        .map((each) => each.finished),
    ).then(() => undefined)`,
  );
}
