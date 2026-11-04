import { act, fireEvent, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { ProjectCostPage } from '../../../web/src/pages/ProjectCostPage.js';
import { projectCost, usageTotals } from './cost-fixtures.js';
import { json, renderPage } from './fake-api.js';
import { history } from './history-fixtures.js';

// RF-428, RNF-010, P8-117: the amounts of a cost table take one Tab stop, and the arrow keys reach the others.

const lines = ['reader', 'verifier', 'summariser'].map((key) => ({
  key,
  local: false,
  totals: usageTotals({ cost: [{ currency: 'USD', costMicros: '7' }] }),
}));

async function tinyAmounts(): Promise<HTMLElement[]> {
  renderPage(
    <ProjectCostPage />,
    {
      'GET /api/projects/p-1/cost': json(200, { ...projectCost, byRole: lines }),
      'GET /api/projects/p-1/history': json(200, history),
    },
    undefined,
    { projectId: 'p-1' },
  );
  const roles = await screen.findByRole('table', { name: 'By role' });
  return within(roles).getAllByText('<$0.0001');
}

function press(amounts: readonly HTMLElement[], from: number, key: string): void {
  const amount = amounts[from];
  if (amount === undefined) throw new Error(`no amount ${String(from)}`);
  fireEvent.keyDown(amount, { key });
}

const tipOf = (amount: HTMLElement) =>
  document.getElementById(amount.getAttribute('aria-describedby') ?? '')?.textContent;

describe('project cost page tab stops of a table', () => {
  it('RF-428 given a table of amounts with exact figures, takes one tab stop and moves between them with the arrow keys', async () => {
    const amounts = await tinyAmounts();

    expect(amounts.map((amount) => amount.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    amounts[0]?.focus();
    press(amounts, 0, 'ArrowDown');
    expect(document.activeElement).toBe(amounts[1]);
    press(amounts, 1, 'End');
    expect(document.activeElement).toBe(amounts[2]);
    press(amounts, 2, 'ArrowDown');
    expect(document.activeElement).toBe(amounts[2]);
    press(amounts, 2, 'ArrowUp');
    expect(document.activeElement).toBe(amounts[1]);
    press(amounts, 1, 'Home');
    expect(document.activeElement).toBe(amounts[0]);
  });

  it('RF-428 given a table of amounts, the tab stop follows the amount last focused, and every figure is still described', async () => {
    const amounts = await tinyAmounts();

    await act(() => {
      amounts[2]?.focus();
    });

    expect(amounts.map((amount) => amount.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    expect(amounts.map(tipOf)).toEqual(['$0.000007', '$0.000007', '$0.000007']);
  });
});
