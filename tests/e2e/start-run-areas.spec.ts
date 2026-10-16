import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import {
  fakeAreas,
  libraryAreas,
  ownAreas,
  panelMetrics,
  scrollToEnds,
  type FakeArea,
} from './support/area-estimate.js';
import { openScannedStartPage } from './support/cost-run.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-1018, RF-1001, RNF-010, P1-172: choosing areas quickly on the start page, with 1 and 120 areas
// at desktop and phone widths. The estimate answer of the test server gets its areas replaced
// (support/area-estimate.ts); the page, its CSS and the real server are the ones under test.

const startButton = { name: /^Start run/u } as const;
const widths = [1280, 360] as const;
const group = { name: 'Areas from the code map' } as const;

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('start-run', info.project.name));
});

async function open(page: Page, areas: readonly FakeArea[]): Promise<void> {
  await fakeAreas(page, areas);
  await openScannedStartPage(page);
  await expect(page.getByRole('region', { name: 'Run summary' })).toBeVisible();
}

async function sidewaysScroll(page: Page): Promise<number> {
  const width = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth');
  return Number(width);
}

for (const width of widths) {
  test(`RF-1018 one area at ${String(width)} px: listed, selected, summed up, nothing to fold`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    await open(
      page,
      ownAreas(1, () => 'Catalog'),
    );

    const summary = page.getByRole('region', { name: 'Run summary' });
    await expect(page.getByRole('group', group).getByRole('checkbox')).toHaveCount(1);
    await expect(summary).toContainText('1 of 1 area');
    await expect(summary).toContainText('3 files');
    await expect(page.getByTestId('library-areas-line')).toHaveCount(0);
    await expect(page.getByRole('button', startButton)).toBeEnabled();
    expect(await sidewaysScroll(page)).toBe(0);
    await expectNoSeriousViolations(page);
  });

  test(`RF-1018 120 areas at ${String(width)} px: the list scrolls in its panel and the summary bar stays in view`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    await open(page, [
      ...ownAreas(120, (i) => `Area${String(i).padStart(3, '0')}`),
      ...libraryAreas(12),
    ]);

    const summary = page.getByRole('region', { name: 'Run summary' });
    await expect(summary).toContainText('120 of 132 areas');
    await expect(summary).toContainText('360 files');
    const heights = await panelMetrics(page);
    expect(heights.scrollHeight).toBeGreaterThan(heights.clientHeight * 2);
    expect(heights.clientHeight).toBeLessThan(700);
    await expect(summary).toBeInViewport({ ratio: 1 });
    await scrollToEnds(page);
    await expect(summary).toBeInViewport({ ratio: 1 });
    await expect(summary.getByRole('button', startButton)).toBeInViewport();
    expect(await sidewaysScroll(page)).toBe(0);
    await transitionsDone(page);
    await expectNoSeriousViolations(page);
  });
}

test('RF-1018 every area is library code: an empty list, a folded line and Start off with its reason', async ({
  page,
}) => {
  await open(
    page,
    ownAreas(1, () => 'Catalog'),
  );
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await fakeAreas(page, libraryAreas(5));
  await page.reload();

  await expect(page.getByText(/No own-code area/u)).toBeVisible();
  await expect(page.getByTestId('library-areas-line')).toContainText('5 library areas left out');
  await expect(page.getByRole('button', startButton)).toBeDisabled();
  await expect(page.getByTestId('start-reason')).toHaveText('Choose at least one area.');
  await expectNoSeriousViolations(page);
});

test('RF-1018 a 60-character area name wraps inside its panel at 360 px', async ({ page }) => {
  const long = 'Services/Billing/Payments/Gateway/Providers/Adapters/Legacy/Map';
  await page.setViewportSize({ width: 360, height: 780 });
  await open(page, [
    ...ownAreas(1, () => long.slice(0, 60)),
    ...ownAreas(3, (i) => `Other${String(i)}`),
  ]);

  const label = page.getByRole('group', group).getByText(long.slice(0, 60), { exact: true });
  await expect(label).toBeVisible();
  const inside = await page.evaluate(`(() => {
    const panel = document.querySelector('.rst-start__area-list').getBoundingClientRect();
    return [...document.querySelectorAll('.rst-start__area-list *')].every(
      (part) => part.getBoundingClientRect().right <= panel.right + 1,
    );
  })()`);
  expect(inside).toBe(true);
  expect(await sidewaysScroll(page)).toBe(0);
});

test('RF-1018 keyboard only: filter, buttons, folded line, boxes and Start are reached and used', async ({
  page,
}) => {
  await open(page, [...ownAreas(3, (i) => `Area${String(i)}`), ...libraryAreas(2)]);
  const summary = page.getByRole('region', { name: 'Run summary' });

  await page.getByLabel('Filter areas').focus();
  await page.keyboard.type('Area1');
  await expect(page.getByRole('group', group).getByRole('checkbox')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Select all' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Select none' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(summary).toContainText('0 of 5 areas');
  await expect(page.getByRole('button', startButton)).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Own code only' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('checkbox', { name: 'Area1' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(summary).toContainText('1 of 5 areas');
  await page.keyboard.press('Tab');
  const show = page.getByTestId('library-areas-line').getByRole('button');
  await expect(show).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(show).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('No library area matches.')).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-1018 choosing library areas shows what they add and Start waits for one confirmation', async ({
  page,
}) => {
  await open(page, [...ownAreas(2, (i) => `Area${String(i)}`), ...libraryAreas(2)]);
  await page.getByTestId('library-areas-line').getByRole('button').click();

  await page.getByRole('checkbox', { name: 'Scripts#1' }).check();

  const notice = page.getByRole('region', { name: 'Library areas chosen' });
  await expect(notice).toContainText('1 library area');
  await expect(notice).toContainText('1,000 tokens');
  await expect(page.getByRole('button', startButton)).toBeDisabled();
  await expect(page.getByTestId('start-reason')).toContainText('Confirm the library areas');
  await expectNoSeriousViolations(page);
  await notice.getByLabel('Read the library areas too').check();
  await expect(page.getByRole('button', startButton)).toBeEnabled();
  await page.getByRole('checkbox', { name: 'Scripts#2' }).check();
  await expect(page.getByRole('button', startButton)).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RNF-010 long area names wrap inside the Stage and areas card at 1280 and 360 px', async ({
  page,
}) => {
  const longPath = 'src/Services/Billing/Payments/Gateway/Providers/Adapters/Legacy/Mapping/Rules';
  const names = [
    `Scripts/${'VeryLongUnbrokenFolderName'.repeat(8)}`,
    ...Array.from({ length: 10 }, (_, index) => `${longPath}/Module${String(index)}`),
  ];
  const areas = names.map((name, index) => ({ name, files: 3, thirdParty: index === 0 }));
  await open(page, areas);
  await page.getByTestId('library-areas-line').getByRole('button').click();
  await expect(page.getByLabel(names[0] ?? '')).toBeVisible();
  await page.waitForLoadState('networkidle');

  for (const width of widths) {
    await page.setViewportSize({ width, height: 780 });
    const measured: unknown = await page.evaluate(`(() => {
      const card = document.querySelector('section[aria-labelledby="stage-heading"]');
      const edge = card.getBoundingClientRect().right;
      const rows = [...document.querySelectorAll('.rst-start__area')];
      return {
        rows: rows.length,
        outside: rows.filter((row) =>
          [row, ...row.querySelectorAll('*')].some((part) => part.getBoundingClientRect().right > edge + 1),
        ).length,
        sideways: document.documentElement.scrollWidth - window.innerWidth,
      };
    })()`);
    expect(measured).toEqual({ rows: names.length, outside: 0, sideways: 0 });
  }
});
