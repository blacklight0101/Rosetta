import type { Locator } from '@playwright/test';
import { expect, test } from './support/fixtures.js';

// RF-1200, P8-102, UX-20: the six stages of the pipeline on the landing page never lay out 5 + 1.
// Above 600 px the rows hold 6, 3 + 3 or 2 + 2 + 2 stages; at 600 px or less the six are one column.
// The rows are read from the stages' own boxes in the browser, at the widths where the old
// auto-fit grid (180 px columns) gave 5 + 1 (1280 and 1100) and 4 + 2 (1024).

const allowedRows: readonly (readonly number[])[] = [[6], [3, 3], [2, 2, 2]];

/** The number of stages in each visual row, top to bottom. */
async function rowsOf(stages: Locator): Promise<number[]> {
  const boxes = await stages.evaluateAll((items) =>
    items.map((item) => Math.round(item.getBoundingClientRect().top)),
  );
  const rows = new Map<number, number>();
  for (const top of boxes) rows.set(top, (rows.get(top) ?? 0) + 1);
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, count]) => count);
}

test.describe('landing page pipeline stages at the breakpoints', () => {
  // P8-138: the two breakpoints, read on both sides (landing.css: one row from 1168 px, one column
  // at 600 px and below).
  for (const [width, expected] of [
    [1168, [6]],
    [1167, [3, 3]],
    [601, [3, 3]],
    [600, [1, 1, 1, 1, 1, 1]],
  ] as const) {
    test(`RF-1200 lays the six stages out as ${expected.join(' + ')} at ${String(width)} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const list = page.getByRole('list', { name: 'Pipeline' });
      await list.scrollIntoViewIfNeeded();

      expect(await rowsOf(list.getByRole('listitem'))).toEqual(expected);
    });
  }

  test('RF-1200 in 3 + 3 the connector of the third and sixth stage ends at the row end', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    const list = page.getByRole('list', { name: 'Pipeline' });
    await list.scrollIntoViewIfNeeded();

    const lines = await list.evaluate((element) => {
      const rowEnd = element.getBoundingClientRect().right;
      return Array.from(element.querySelectorAll(':scope > li'), (item) => {
        const box = item.getBoundingClientRect();
        const end = box.right - parseFloat(getComputedStyle(item, '::before').right);
        return { pastRowEnd: Math.round(end - rowEnd), pastStage: Math.round(end - box.right) };
      });
    });

    // The third and sixth lines end at the row end; the first runs on into the gap before the second.
    expect(lines[2]?.pastRowEnd).toBe(0);
    expect(lines[5]?.pastRowEnd).toBe(0);
    expect(lines[0]?.pastStage).toBeGreaterThan(0);
  });
});

test.describe('landing page pipeline stages', () => {
  for (const width of [1280, 1100, 1024, 768, 601]) {
    test(`RF-1200 lays the six stages out as 6, 3 + 3 or 2 + 2 + 2 at ${String(width)} px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const list = page.getByRole('list', { name: 'Pipeline' });
      await list.scrollIntoViewIfNeeded();

      const rows = await rowsOf(list.getByRole('listitem'));

      expect(allowedRows).toContainEqual(rows);
      if (width === 1280) {
        await list.screenshot({ path: testInfo.outputPath('landing-stages-1280.png') });
        expect(rows).toEqual([6]);
      }
    });
  }

  test('RF-1200 shows the six stages as one column in pipeline order at 390 px', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/');
    const list = page.getByRole('list', { name: 'Pipeline' });
    await list.scrollIntoViewIfNeeded();

    const rows = await rowsOf(list.getByRole('listitem'));
    await list.screenshot({ path: testInfo.outputPath('landing-stages-390.png') });

    expect(rows).toEqual([1, 1, 1, 1, 1, 1]);
    await expect(list.getByRole('heading', { level: 3 })).toHaveText([
      'Choose the source',
      'Map the code',
      'Agents write cards',
      'Check every claim',
      'You decide',
      'Report and hand-off',
    ]);
  });
});
