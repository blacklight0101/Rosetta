import { fireEvent, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import type { CostLine, ProjectCost } from '../../../web/src/api/cost-schemas.js';
import { ProjectCostPage } from '../../../web/src/pages/ProjectCostPage.js';
import { projectCost, usageTotals } from './cost-fixtures.js';
import { failure, json, renderPage } from './fake-api.js';
import { deepenRun, history, liveKey } from './history-fixtures.js';

// RF-428, DEC-211, P8-109: the breakdown by run of the cost page as the `P8HistoryCost` artboard draws it:
// the run, its Kind in History's words, one column for each of the four roles, the run's total, and a
// Project total row.

type Role = 'reader' | 'verifier' | 'planner' | 'summariser';
type Spend = Partial<Record<Role, number>>;

const costPath = 'GET /api/projects/p-1/cost';
const historyPath = 'GET /api/projects/p-1/history';

const costOf = (micros: number) =>
  usageTotals({ cost: [{ currency: 'USD', costMicros: String(micros) }] });

/** A run line whose roles spent `spend` micro-dollars, its total the sum of them, as the route answers. */
function runLine(runId: string | null, spend: Spend): ProjectCost['byRun'][number] {
  const roles: CostLine[] = Object.entries(spend)
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, micros]) => ({ key, local: false, totals: costOf(micros) }));
  const sum = Object.values(spend).reduce((total, micros) => total + micros, 0);
  return {
    ...{ key: runId ?? 'plan-options', runId, firstAt: '2026-11-03T09:00:00.000Z', local: false },
    totals: costOf(sum),
    byRole: roles,
  };
}

const planKey = '20261103-092504-plan';
const planRun = { ...history.runs[1], id: 'r-6', runId: planKey, stage: 'plan' };

const runs = {
  ...history,
  runs: [planRun, history.runs[0], deepenRun],
};

// r-6: a Plan; r-4: an Understand; r-5: a Deepen of three rounds. $0.0242 + $0.0371 + $0.0937 = $0.1550.
const cost: ProjectCost = {
  ...projectCost,
  totals: costOf(155_000),
  byRun: [
    runLine('r-6', { planner: 24_200 }),
    runLine('r-4', { reader: 20_000, verifier: 10_000, summariser: 7_100 }),
    runLine('r-5', { reader: 40_000, verifier: 30_000, summariser: 23_700 }),
  ],
};

function renderCost(answer = json(200, cost), history_ = json(200, runs)) {
  return renderPage(
    <ProjectCostPage />,
    { [costPath]: answer, [historyPath]: history_ },
    undefined,
    { projectId: 'p-1' },
  );
}

const byRun = () => screen.findByRole('table', { name: 'By run' });

/** What a cell shows: the amount alone, without the exact figure beside it. */
const shown = (cell: HTMLElement): string =>
  (cell.querySelector('[data-rst-amount], [aria-hidden]') ?? cell).textContent;

const rowOf = (table: HTMLElement, name: string | RegExp): HTMLElement =>
  within(table).getByRole('row', { name });

/** The cells after the run's name: Kind, Reader, Verifier, Planner, Summariser, Total. */
const cellsOf = (row: HTMLElement): string[] => within(row).getAllByRole('cell').map(shown);

describe('cost by run columns', () => {
  it('RF-428 names the columns Run, Kind, the four roles and Total, and keeps the table name', async () => {
    renderCost();

    const table = await byRun();

    const heads = within(table)
      .getAllByRole('columnheader')
      .map((head) => head.textContent);
    expect(heads).toEqual(['Run', 'Kind', 'Reader', 'Verifier', 'Planner', 'Summariser', 'Total']);
  });

  it('RF-428 names the Kind of each run in the words of History, a Deepen with its rounds', async () => {
    renderCost();

    const table = await byRun();

    expect(cellsOf(rowOf(table, /-plan/u))[0]).toBe('Plan');
    expect(cellsOf(rowOf(table, new RegExp(liveKey, 'u')))[0]).toBe('Understand');
    expect(cellsOf(rowOf(table, /20261012-100000-understand/u))[0]).toBe('Deepen, 3 rounds');
  });

  it('RF-428 reads a dash for the Kind of a run History cannot name and of the calls of no run', async () => {
    const options = { ...runLine(null, { planner: 5_000 }), key: 'plan-options' };
    renderCost(json(200, { ...cost, byRun: [...cost.byRun, options] }), failure(500, 'RST-9000'));

    const table = await byRun();

    expect(cellsOf(rowOf(table, /r-4/u))[0]).toBe('-');
    expect(cellsOf(rowOf(table, /Plan setup options/u))[0]).toBe('-');
  });
});

describe('cost by run roles and total', () => {
  it('RF-428 shows each role of a run in its column and a dash, never zero, for a role with no calls', async () => {
    renderCost();

    const table = await byRun();

    expect(cellsOf(rowOf(table, /-plan/u))).toEqual(['Plan', '-', '-', '$0.0242', '-', '$0.0242']);
    expect(cellsOf(rowOf(table, /20261012-100000-understand/u))).toEqual([
      ...['Deepen, 3 rounds', '$0.0400', '$0.0300', '-', '$0.0237', '$0.0937'],
    ]);
    expect(cellsOf(rowOf(table, new RegExp(liveKey, 'u')))).toEqual([
      ...['Understand', '$0.0200', '$0.0100', '-', '$0.0071', '$0.0371'],
    ]);
    expect(within(table).queryByText('$0.00')).toBeNull();
  });

  it('RF-428 adds up the exact amounts of the role cells to the Total, where the figures shown may not', async () => {
    // $0.012345 + $0.012345 = $0.024690: shown $0.0123 + $0.0123 = $0.0246 against a Total of $0.0247.
    const line = runLine('r-4', { reader: 12_345, verifier: 12_345 });
    renderCost(json(200, { ...cost, byRun: [line], totals: costOf(24_690) }));

    const row = rowOf(await byRun(), new RegExp(liveKey, 'u'));

    const exact = within(row)
      .getAllByRole('tooltip', { hidden: true })
      .map((tip) => tip.textContent);
    expect(exact).toEqual(['$0.012345', '$0.012345', '$0.02469']);
    const micros = exact.map((figure) => Math.round(Number(figure.replace('$', '')) * 1_000_000));
    expect((micros[0] ?? 0) + (micros[1] ?? 0)).toBe(micros[2]);
    expect(cellsOf(row)).toEqual(['Understand', '$0.0123', '$0.0123', '-', '-', '$0.0247']);
  });
});

describe('cost by run project total', () => {
  it('RF-428 ends the table with a Project total row from the totals of the page', async () => {
    renderCost();

    const table = await byRun();

    const rows = within(table).getAllByRole('row');
    const last = rows[rows.length - 1];
    if (last === undefined) throw new Error('a row expected');
    expect(within(last).getByRole('rowheader').textContent).toBe('Project total');
    expect(within(last).getAllByRole('cell').map(shown)).toEqual(['', '', '', '', '', '$0.1550']);
  });

  it('RF-428 shows the zero of a local run as `$0.00` and a tiny cost as `<$0.0001`', async () => {
    const lines = [runLine('r-4', { reader: 0 }), runLine('r-5', { reader: 7 })];
    renderCost(json(200, { ...cost, byRun: lines, totals: costOf(7) }));

    const table = await byRun();

    expect(cellsOf(rowOf(table, new RegExp(liveKey, 'u')))).toContain('$0.00');
    expect(cellsOf(rowOf(table, /20261012-100000-understand/u))).toContain('<$0.0001');
  });

  it('RF-428 names the price table once above the table, not in a column, when the runs used the same one', async () => {
    renderCost();
    const same = await byRun();
    expect(within(same).queryByRole('columnheader', { name: 'Price table' })).toBeNull();
    expect(screen.getAllByText('Prices of 11 Oct 2026, for every row below')).toHaveLength(6);
  });
});

describe('cost by run amounts', () => {
  const tiny = (spend: Spend) => runLine('r-4', spend);

  it('RF-428 gives the amounts of the table one tab stop, with the figure of each in a tooltip', async () => {
    const lines = [tiny({ reader: 7, verifier: 7 }), runLine('r-5', { reader: 7 })];
    renderCost(json(200, { ...cost, byRun: lines, totals: costOf(21) }));

    const table = await byRun();

    const amounts = [...table.querySelectorAll<HTMLElement>('[data-rst-amount]')];
    expect(amounts.map((amount) => amount.getAttribute('tabindex'))).toEqual([
      '0',
      ...Array.from({ length: amounts.length - 1 }, () => '-1'),
    ]);
    expect(amounts).toHaveLength(6);
    expect(amounts.every((amount) => amount.hasAttribute('aria-describedby'))).toBe(true);
  });

  it('RF-428 moves between the amounts with the arrow keys, Home and End, the Project total included', async () => {
    const lines = [tiny({ reader: 7, verifier: 7 })];
    renderCost(json(200, { ...cost, byRun: lines, totals: costOf(14) }));
    const table = await byRun();
    const amounts = [...table.querySelectorAll<HTMLElement>('[data-rst-amount]')];
    const [first, second] = amounts;
    const last = amounts[amounts.length - 1];
    if (first === undefined || second === undefined || last === undefined)
      throw new Error('amounts');

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: 'End' });

    expect(document.activeElement).toBe(last);
    expect(last.closest('tr')?.textContent).toContain('Project total');
    expect(last.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('tabindex')).toBe('-1');
  });
});
