import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from '../support/axe.js';
import { expect, test } from '../support/fixtures.js';
import {
  gappedPlan,
  journey,
  rowsOf,
  routeJourney,
  showStepDetails,
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

/** What the tokens of the colour scheme compute to, read through an element that uses them. */
async function toneColours(page: Page): Promise<Record<'ok' | 'warn' | 'danger', string>> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const colour = (token: string): string => {
      probe.style.color = `var(--rst-${token}-ink)`;
      return getComputedStyle(probe).color;
    };
    const read = { ok: colour('ok'), warn: colour('warn'), danger: colour('danger') };
    probe.remove();
    return read;
  });
}

/** The colour the state word (or, with `.rst-road__mark`, the glyph) of a step computes to. */
async function stateColour(page: Page, title: string, part = '.rst-road__state'): Promise<string> {
  return journey(page)
    .getByRole('listitem')
    .filter({ has: page.locator('.rst-road__title', { hasText: new RegExp(`^${title}$`, 'u') }) })
    .locator(part)
    .evaluate((word) => getComputedStyle(word).color);
}

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
    const tones = await toneColours(page);
    const done = await stateColour(page, 'Understand');
    const failed = await stateColour(page, 'Plan');
    const gaps = await stateColour(page, 'Package');
    expect(done).toBe(tones.ok);
    expect(failed).toBe(tones.danger);
    expect(gaps).toBe(tones.warn);
    expect(new Set([done, failed, gaps]).size).toBe(3);
    // P8-138: the glyph beside the state word takes the same tone (journey.css, `.rst-road__mark`).
    expect(await stateColour(page, 'Understand', '.rst-road__mark')).toBe(tones.ok);
    expect(await stateColour(page, 'Plan', '.rst-road__mark')).toBe(tones.danger);
    expect(await stateColour(page, 'Package', '.rst-road__mark')).toBe(tones.warn);
    await transitionsDone(page);
    await expectNoSeriousViolations(page);
  },
);

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
