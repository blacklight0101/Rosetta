import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from '../support/axe.js';
import { expect, test } from '../support/fixtures.js';
import {
  colourOf,
  gappedPlan,
  journey,
  rowsOf,
  routeJourney,
  showStepDetails,
  stepOf,
  tokenColour,
} from '../support/journey-strip.js';
import { accountFor } from '../support/seed.js';
import { signInAs } from '../support/sign-in.js';
import { replayRunId } from '../support/seed-replay.js';
import { transitionsDone } from '../support/transitions.js';

// RF-1020, P8-100: the compact row of the journey strip keeps the tone of each state (Done green,
// Failed red, With gaps and Stopped at its cap amber, as the expanded cards draw them), and no title or
// state word of a step breaks inside a word at any width: the columns give way before the text does.
// The tests run in the four views (@visual), so the dark tones and the dark 360 px view are checked too.

const widths = [1920, 1280, 1024, 900, 760, 720, 600, 360, 320] as const;

/** Each word of the titles and state words that a line break splits: an empty list when none does. */
async function brokenWords(page: Page): Promise<string[]> {
  return journey(page)
    .locator('.rst-road__title, .rst-road__state, .rst-road__here')
    .evaluateAll((elements) => {
      const textOf = (element: Element): Text[] => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const found: Text[] = [];
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          if (node instanceof Text) found.push(node);
        }
        return found;
      };
      const wordsOf = (node: Text): Range[] =>
        Array.from(node.data.matchAll(/\S+/gu), (match) => {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          return range;
        });
      // A word that a line break splits has client rects at more than one height.
      const isSplit = (range: Range): boolean =>
        new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size > 1;
      return elements
        .flatMap(textOf)
        .flatMap(wordsOf)
        .filter(isSplit)
        .map((range) => range.toString());
    });
}

test(
  'RF-1020 P8-100 the compact row keeps the tone of Done, With gaps and Failed, which differ from one another',
  { tag: '@visual' },
  async ({ page }, info) => {
    await signInAs(page.context(), accountFor('replay', info.project.name));
    await routeJourney(page, info.project.name, gappedPlan());

    await page.goto(`/runs/${replayRunId(info.project.name)}`);

    await expect(journey(page).getByRole('listitem')).toHaveCount(7);
    await expect(journey(page).locator('.rst-road__detail').first()).toBeHidden();
    const done = (await colourOf(page, 'Understand')).color;
    const failed = (await colourOf(page, 'Plan')).color;
    const gaps = (await colourOf(page, 'Package')).color;
    expect(done).toBe(await tokenColour(page, 'ok-ink'));
    expect(failed).toBe(await tokenColour(page, 'danger-ink'));
    expect(gaps).toBe(await tokenColour(page, 'warn-ink'));
    expect(new Set([done, failed, gaps]).size).toBe(3);
    // P8-138: the glyph beside the state word takes the same tone (journey.css, `.rst-road__mark`).
    expect((await colourOf(page, 'Understand', '.rst-road__mark')).color).toBe(done);
    expect((await colourOf(page, 'Plan', '.rst-road__mark')).color).toBe(failed);
    expect((await colourOf(page, 'Package', '.rst-road__mark')).color).toBe(gaps);
    await transitionsDone(page);
    await expectNoSeriousViolations(page);
  },
);

// RF-1020, DEC-217, P8-125: the step of a run at its cap is in the warn tone, never the danger tone of a
// failed step: its state word and glyph in the compact row, and its pill when the details are shown.
test('RF-1020 P8-125 a run at its cap is in the warn tone, folded and open, never the danger tone', async ({
  page,
}, info) => {
  await signInAs(page.context(), accountFor('replay', info.project.name));
  const cap = { endState: 'CapReached', errorCode: 'RST-1600', unreadAreas: 2 };
  await routeJourney(page, info.project.name, { plan: null, handoff: null }, cap);
  await page.goto(`/runs/${replayRunId(info.project.name)}`);

  await expect(stepOf(page, 'Understand')).toHaveAttribute('data-state', 'capped');
  await expect(stepOf(page, 'Understand').locator('.rst-road__state')).toHaveText(
    'Stopped at its cap',
  );
  const warn = await tokenColour(page, 'warn-ink');
  expect(warn).not.toBe(await tokenColour(page, 'danger-ink'));
  expect((await colourOf(page, 'Understand')).color).toBe(warn);
  expect((await colourOf(page, 'Understand', '.rst-road__mark')).color).toBe(warn);
  await showStepDetails(page);
  expect(await colourOf(page, 'Understand')).toEqual({
    color: warn,
    background: await tokenColour(page, 'warn-bg'),
  });
});

test(
  'RF-1020 P8-100 no title or state word of the strip breaks inside a word from 320 to 1920 px, folded or open',
  { tag: '@visual' },
  async ({ page }, info) => {
    await signInAs(page.context(), accountFor('replay', info.project.name));
    await routeJourney(page, info.project.name, gappedPlan());
    await page.goto(`/runs/${replayRunId(info.project.name)}`);
    await expect(journey(page).getByRole('listitem')).toHaveCount(7);

    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      expect(await brokenWords(page), `folded at ${String(width)} px`).toEqual([]);
    }
    await showStepDetails(page);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      expect(await brokenWords(page), `open at ${String(width)} px`).toEqual([]);
    }
  },
);

test(
  'RF-1020 P8-100 at 360 px the compact row is two columns of four rows, not seven stacked rows',
  { tag: '@visual' },
  async ({ page }, info) => {
    await signInAs(page.context(), accountFor('replay', info.project.name));
    await routeJourney(page, info.project.name, gappedPlan());
    await page.goto(`/runs/${replayRunId(info.project.name)}`);
    await expect(journey(page).getByRole('listitem')).toHaveCount(7);

    await page.setViewportSize({ width: 360, height: 780 });

    expect(await rowsOf(page)).toBe(4);
    const strip = await journey(page).locator('.rst-road__steps').boundingBox();
    expect(strip?.height ?? Infinity).toBeLessThan(400);
  },
);
