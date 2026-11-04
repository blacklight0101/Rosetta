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
const stopsOf = (table: HTMLElement): HTMLElement[] =>
  amountsOf(table).filter((amount) => amount.getAttribute('tabindex') === '0');

/** Three amounts: two with an exact figure, one plain ($3.88 is exact), in the order a table lists them. */
const costs = [3_113_515, 237_000, 3_880_000, 12_345] as const;

function checkTable(table: HTMLElement): void {
  const amounts = amountsOf(table);
  expect(amounts.map((amount) => amount.textContent)).toEqual(['$3.11', '$0.2370', '$0.0123']);
  expect(
    within(table)
      .getAllByRole('tooltip')
      .map((tip) => tip.textContent),
  ).toEqual(['$3.113515', '$0.237', '$0.012345']);
  expect(table.textContent).toContain('$3.88');
  expect(stopsOf(table)).toEqual([amounts[0]]);
}

async function checkTabStopFollowsFocus(table: HTMLElement): Promise<void> {
  const amounts = amountsOf(table);
  fireEvent.focus(amounts[1] ?? table);
  await waitFor(
    () => {
      expect(stopsOf(table)).toEqual([amounts[1]]);
    },
    { timeout: 500 },
  );
  fireEvent.keyDown(amounts[1] ?? table, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(amounts[2]);
  fireEvent.keyDown(amounts[2] ?? table, { key: 'Home' });
  expect(document.activeElement).toBe(amounts[0]);
}

describe('the other tables follow the cost page for amounts', () => {
  it('RF-428 the accounts table gives the month to date a tooltip and one Tab stop that follows the focus', async () => {
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
    checkTable(table);
    await checkTabStopFollowsFocus(table);
  });

  it('RF-428 the API calls table gives the cost of a call a tooltip and one Tab stop that follows the focus', async () => {
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
    checkTable(table);
    await checkTabStopFollowsFocus(table);
  });

  it('RF-428 the summary per provider and role gives the cost a tooltip and one Tab stop that follows the focus', async () => {
    const [first] = callsSchema.parse(callsBody({}, sampleCalls)).summary;
    if (first === undefined) throw new Error('The summary has no row.');
    const rows = costs.map((costMicros, at) => ({
      ...first,
      role: `role${String(at)}`,
      costMicros,
    }));
    render(<CallSummary rows={rows} />);

    const table = screen.getByRole('table');
    checkTable(table);
    await checkTabStopFollowsFocus(table);
  });

  it('RF-428 the runs of a project give the cost a tooltip and one Tab stop that follows the focus, and a run of no cost reads No cost', async () => {
    const runs = runHistorySchema.parse({
      ...history,
      runs: [...costs, 0].map((cost, at) => {
        const run = history.runs[at % history.runs.length];
        return { ...run, id: `r-${String(at)}`, totals: { ...run?.totals, costMicros: cost } };
      }),
    }).runs;
    render(<ProjectRuns runs={runs} />);

    const table = screen.getByRole('table', { name: 'Runs of this project' });
    checkTable(table);
    expect(table.textContent).toContain('No cost');
    await checkTabStopFollowsFocus(table);
  });
});
