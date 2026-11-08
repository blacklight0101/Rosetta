import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';
import { replayRunId } from './seed-replay.js';

// RF-1020, P8-100: what the specs of the journey strip share: the strip and its steps, the button that
// opens the detail cards, and the facts of a run that the page reads from `/api/projects/:id/journey`.

export const journey = (page: Page): Locator =>
  page.getByRole('region', { name: 'Journey from code to package' });

/** The item of a step, found by its title. */
export const stepOf = (page: Page, title: string): Locator =>
  journey(page)
    .getByRole('listitem')
    .filter({
      has: page.locator('.rst-road__title', { hasText: new RegExp(`^${title}$`, 'u') }),
    });

/** RF-1020, P8-100: the strip is a compact row; this opens the detail cards (once, when they are open it does nothing). */
export async function showStepDetails(page: Page): Promise<void> {
  if (await journey(page).getByRole('button', { name: 'Hide step details' }).isVisible()) return;
  await journey(page).getByRole('button', { name: 'Show step details' }).click();
  await expect(journey(page).getByRole('button', { name: 'Hide step details' })).toHaveAttribute(
    'aria-expanded',
    'true',
  ); // P8-138: the details are read with toContainText, which reads hidden text too, so the open body
  // must be seen before the caller asserts on it.
  await expect(journey(page).locator('.rst-road__detail').first()).toBeVisible();
}

/** The facts the journey of the recorded run is drawn from: its plan run and package, or none. */
export async function routeJourney(
  page: Page,
  project: string,
  later: { readonly plan: object | null; readonly handoff: object | null },
  /** P8-125: how the understand run ended, when it did not complete (`endState`, `errorCode`). */
  end: object = {},
): Promise<void> {
  const ended = { queueState: 'Ended', endedAt: '2026-10-12T10:31:00.000Z' };
  await page.route('**/api/projects/*/journey*', async (route) => {
    await route.fulfill({
      json: {
        scanRunId: null,
        briefSaved: later.plan !== null,
        source: {
          ...{ id: replayRunId(project), runKey: '20261012-100000-understand' },
          ...{ endState: 'Completed', costMicros: 120_000, errorCode: null, ...ended },
          ...{ supportedClaims: 4, openQuestions: 0 },
          ...end,
        },
        ...later,
      },
    });
  });
}

/** RF-1020, P8-125: what a colour token of the scheme computes to, read through an element that uses it. */
export async function tokenColour(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    document.body.append(probe);
    probe.style.color = `var(--rst-${name})`;
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

/** RF-1020: the computed colours of a part of a step (its state word by default). */
export async function colourOf(
  page: Page,
  title: string,
  part = '.rst-road__state',
): Promise<{ readonly color: string; readonly background: string }> {
  return stepOf(page, title)
    .locator(part)
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor };
    });
}

/** The plan run of the failure paths: written with gaps and ended RST-1806. */
export const gappedPlan = (): { readonly plan: object; readonly handoff: object } => {
  const planId = '00000000-0000-4000-a0ee-0000000000f1';
  return {
    plan: {
      ...{ id: planId, runKey: '20261012-103000-plan', endState: 'Failed' },
      ...{ costMicros: 31_000, errorCode: 'RST-1806' },
      ...{ queueState: 'Ended', endedAt: '2026-10-12T10:31:00.000Z' },
    },
    handoff: { runId: planId, runKey: '20261012-103000-plan', outOfDate: false, gaps: true },
  };
};

/** The distinct vertical positions of the seven steps: one means they stand in a single row. */
export async function rowsOf(page: Page): Promise<number> {
  const tops = await journey(page)
    .getByRole('listitem')
    .evaluateAll((items) => items.map((each) => Math.round(each.getBoundingClientRect().top)));
  return new Set(tops).size;
}
