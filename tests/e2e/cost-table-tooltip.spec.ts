import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { costAccountFor } from './support/seed-cost.js';
import { signInAs } from './support/sign-in.js';

// RF-428, RNF-010, DEC-220, design-system.md section 5.1, P8-127: the exact figure of an amount in a
// table of the cost page moves nothing. Focusing and hovering the first and the last amount of each table
// leaves every cell where it was, the table and its scrolling box as wide and the page as large, and the
// figure is whole: inside the viewport and on top, in the four views (@visual). The test gives the cost
// answer, whose amounts all carry an exact figure in every table, and an empty History.

const visual = { tag: '@visual' };

const totalsOf = (costMicros: string) => ({
  calls: 3,
  inputTokens: 12_400,
  outputTokens: 1_350,
  cachedInputTokens: 0,
  cost: [{ currency: 'USD', costMicros }],
  unknownCostCalls: 0,
  priceTableVersions: ['e2e-tip'],
});

const line = (key: string, costMicros: string) => ({
  key,
  local: false,
  totals: totalsOf(costMicros),
});

/** A cost answer whose amounts read `$1.23`, `$0.0988` and `<$0.0001`, each with a longer exact figure. */
function costAnswer(project: { readonly id: string; readonly name: string }) {
  return {
    project,
    totals: totalsOf('1333339'),
    byRun: [
      {
        ...line('run-tip-a', '1234567'),
        runId: 'run-tip-a',
        firstAt: '2026-11-01T10:00:00.000Z',
        byRole: [line('reader', '1135802'), line('verifier', '98765')],
      },
      {
        ...line('run-tip-b', '98772'),
        runId: 'run-tip-b',
        firstAt: '2026-11-02T10:00:00.000Z',
        byRole: [line('summariser', '98765'), line('planner', '7')],
      },
    ],
    byStage: [line('understand', '1234567'), line('plan', '98772')],
    byRole: [
      line('reader', '1135802'),
      line('verifier', '98765'),
      line('summariser', '98765'),
      line('planner', '7'),
    ],
    byProvider: [line('openai', '1234567'), line('anthropic', '98772')],
    byModel: [
      { ...line('openai/gpt-5-nano', '1234567'), provider: 'openai', model: 'gpt-5-nano' },
      { ...line('anthropic/claude-x', '98772'), provider: 'anthropic', model: 'claude-x' },
    ],
    providerTests: null,
  };
}

/** A project id of no project: the page reads only the cost answer and History, both given here. */
const projectId = '00000000-0000-4000-8000-0000000e2127';

async function openCostPage(page: Page): Promise<void> {
  await page.route('**/api/projects/*/cost', async (route) => {
    await route.fulfill({
      json: costAnswer({ id: projectId, name: 'tooltip-steady' }),
    });
  });
  await page.route('**/api/projects/*/history*', async (route) => {
    await route.fulfill({ json: { runs: [] } });
  });
  await page.goto(`/projects/${projectId}/cost`);
  await expect(page.getByRole('heading', { name: 'Project cost', level: 1 })).toBeVisible();
}

/**
 * Where every cell of the table stands in the table, where the table stands on the page and how large the
 * table, its scrolling box and the page are. Places are taken from the body's box, so a scroll of the page by
 * a fraction of a pixel (a focus or a hover can bring the amount into view) is not read as a move.
 */
async function layoutOf(page: Page, table: Locator): Promise<unknown> {
  return {
    cells: await table.locator('th, td').evaluateAll((cells) =>
      cells.map((cell) => {
        const box = cell.getBoundingClientRect();
        const origin = cell.closest('table')?.getBoundingClientRect() ?? box;
        return [box.x - origin.x, box.y - origin.y, box.width, box.height];
      }),
    ),
    table: await table.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const body = document.body.getBoundingClientRect();
      return [box.x - body.x, box.y - body.y, box.width, box.height];
    }),
    scrollBox: await table.evaluate((element) => {
      const box = element.parentElement;
      return [box?.scrollWidth, box?.scrollHeight, box?.clientWidth, box?.clientHeight];
    }),
    pageBox: await page.evaluate(() => {
      const root = document.documentElement;
      return [root.scrollWidth, root.scrollHeight, root.clientWidth, root.clientHeight];
    }),
  };
}

/** Inside the viewport, and on top at a point just inside each corner: nothing clips or covers it. */
async function expectWholeTip(tip: Locator): Promise<void> {
  await expect(tip).toBeVisible();
  const seen = await tip.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const root = document.documentElement;
    const corners = [
      [box.left + 2, box.top + 2],
      [box.right - 2, box.top + 2],
      [box.left + 2, box.bottom - 2],
      [box.right - 2, box.bottom - 2],
    ] as const;
    return {
      inView:
        box.left >= 0 &&
        box.top >= 0 &&
        box.right <= root.clientWidth &&
        box.bottom <= root.clientHeight,
      shown: corners.every(([x, y]) => {
        const found = document.elementFromPoint(x, y);
        return found !== null && element.contains(found);
      }),
    };
  });
  expect(seen).toEqual({ inView: true, shown: true });
}

/** The exact figure of an amount: the tooltip its value points at. */
async function tipOf(page: Page, value: Locator): Promise<Locator> {
  const id = await value.getAttribute('aria-describedby');
  if (id === null) throw new Error('The amount points at no tooltip.');
  return page.locator(`[id="${id}"]`);
}

/** Focus and then hover open the amount's figure; neither moves anything of the table or the page. */
async function expectSteadyOn(page: Page, table: Locator, value: Locator): Promise<void> {
  const tip = await tipOf(page, value);
  await value.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
  const rest = await layoutOf(page, table);

  await value.focus();
  await expectWholeTip(tip);
  expect(await layoutOf(page, table)).toEqual(rest);
  await value.blur();
  await expect(tip).toBeHidden();

  await value.hover();
  await expectWholeTip(tip);
  expect(await layoutOf(page, table)).toEqual(rest);
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
  expect(await layoutOf(page, table)).toEqual(rest);
}

const tables = ['By run', 'By stage', 'By role', 'By provider', 'By model'] as const;

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, costAccountFor('cost', info.project.name));
});

test(
  'RF-428 RNF-010 the exact figure of a cost table amount moves nothing of the table or the page',
  visual,
  async ({ page }) => {
    // Ten amounts, each opened twice and measured three times: longer than the default 30 s.
    test.setTimeout(120_000);
    await openCostPage(page);
    for (const name of tables) {
      const table = page.getByRole('table', { name });
      const amounts = table.locator('[data-rst-amount]');
      await expect(amounts.first()).toBeVisible();
      await expectSteadyOn(page, table, amounts.first());
      await expectSteadyOn(page, table, amounts.last());
    }
  },
);
