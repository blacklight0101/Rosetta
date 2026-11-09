import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { userListSchema } from '../../../web/src/api/admin-schemas.js';
import { callsSchema } from '../../../web/src/api/call-schemas.js';
import { runHistorySchema } from '../../../web/src/api/history-schemas.js';
import { AccountsTable } from '../../../web/src/pages/AccountsTable.js';
import { CallsTable } from '../../../web/src/pages/CallsTable.js';
import { CallSummary } from '../../../web/src/pages/CallSummary.js';
import { ProjectRuns } from '../../../web/src/pages/ProjectRuns.js';
import { accountBody, spent } from './admin-fixtures.js';
import { callsBody, cloud, sampleCalls } from './api-calls-fixtures.js';
import { history } from './history-fixtures.js';

// RF-428, RNF-010, DEC-54, DEC-217, P8-91: the tables of the other pages write every amount by the one
// formatter, give an amount whose exact figure differs a tooltip, and keep one Tab stop among their
// amounts, which follows the amount last reached.

afterEach(cleanup);

const amountsOf = (table: HTMLElement): HTMLElement[] => [
  ...table.querySelectorAll<HTMLElement>('[data-rst-amount]'),
];
const stopsOf = (table: HTMLElement): number[] =>
  amountsOf(table).flatMap((amount, at) => (amount.getAttribute('tabindex') === '0' ? [at] : []));

/** Two amounts with an exact figure, one plain ($3.88 is exact), one tiny, in the order a table lists them. */
const costs = [3_113_515, 237_000, 3_880_000, 12_345] as const;
const shape = {
  shown: ['$3.11', '$0.2370', '$0.0123'],
  tips: ['$3.113515', '$0.237', '$0.012345'],
  stops: [0],
};

/** What a table shows: its amounts, their tooltips and which of them is the Tab stop. */
const readTable = (table: HTMLElement) => ({
  shown: amountsOf(table).map((amount) => amount.textContent),
  tips: within(table)
    .getAllByRole('tooltip')
    .map((tip) => tip.textContent),
  stops: stopsOf(table),
});

/** Focus the second amount, press ArrowDown on it and Home on the next: where the focus went and where the Tab stop ends. */
async function followFocus(table: HTMLElement) {
  const amounts = amountsOf(table);
  fireEvent.focus(amounts[1] ?? table);
  await waitFor(
    () => {
      expect(stopsOf(table)).toEqual([1]);
    },
    { timeout: 500 },
  );
  fireEvent.keyDown(amounts[1] ?? table, { key: 'ArrowDown' });
  const down = amounts.indexOf(
    document.activeElement instanceof HTMLElement ? document.activeElement : table,
  );
  fireEvent.keyDown(amounts[2] ?? table, { key: 'Home' });
  const home = amounts.indexOf(
    document.activeElement instanceof HTMLElement ? document.activeElement : table,
  );
  return { stopAtEnd: stopsOf(table), down, home };
}
const followed = { stopAtEnd: [0], down: 2, home: 0 };

describe('the accounts table', () => {
  it('RF-428 gives the month to date a tooltip and one Tab stop that follows the focus', async () => {
    const users = userListSchema.parse({
      users: costs.map((cost, at) =>
        accountBody(`u-${String(at)}`, `user${String(at)}`, { monthToDate: spent(String(cost)) }),
      ),
    }).users;
    render(
      <AccountsTable
        users={users}
        ownId="u-root"
        busyId={undefined}
        onChange={() => undefined}
        onReset={() => undefined}
        onWorkspace={() => undefined}
      />,
    );

    const table = screen.getByRole('table', { name: 'Accounts' });
    expect(readTable(table)).toEqual(shape);
    expect(await followFocus(table)).toEqual(followed);
  });
});

describe('the API calls table', () => {
  it('RF-428 gives the cost of a call a tooltip and one Tab stop that follows the focus', async () => {
    const calls = costs.map((costMicros, at) => cloud(at + 1, { costMicros }));
    render(
      <CallsTable
        calls={callsSchema.parse(callsBody({}, calls)).calls}
        selected={undefined}
        transcriptHref={() => '#'}
        onSelect={() => undefined}
      />,
    );

    const table = screen.getByRole('table');
    expect(readTable(table)).toEqual(shape);
    expect(await followFocus(table)).toEqual(followed);
  });
});

describe('the summary per provider and role', () => {
  it('RF-428 gives the cost a tooltip and one Tab stop that follows the focus', async () => {
    const [first] = callsSchema.parse(callsBody({}, sampleCalls)).summary;
    if (first === undefined) throw new Error('The summary has no row.');
    const rows = costs.map((costMicros, at) => ({
      ...first,
      role: `role${String(at)}`,
      costMicros,
    }));
    render(<CallSummary rows={rows} />);

    const table = screen.getByRole('table');
    expect(readTable(table)).toEqual(shape);
    expect(await followFocus(table)).toEqual(followed);
  });
});

describe('the runs of a project', () => {
  it('RF-428 give the cost a tooltip and one Tab stop that follows the focus, and a run of no cost reads No cost', async () => {
    const runs = runHistorySchema.parse({
      ...history,
      runs: [...costs, 0].map((cost, at) => {
        const run = history.runs[at % history.runs.length];
        return { ...run, id: `r-${String(at)}`, totals: { ...run?.totals, costMicros: cost } };
      }),
    }).runs;
    render(<ProjectRuns runs={runs} />);

    const table = screen.getByRole('table', { name: 'Runs of this project' });
    expect(readTable(table)).toEqual(shape);
    expect(table.textContent).toContain('No cost');
    expect(await followFocus(table)).toEqual(followed);
  });
});
