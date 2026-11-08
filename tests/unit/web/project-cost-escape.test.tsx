import { act, fireEvent, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { ProjectCostPage } from '../../../web/src/pages/ProjectCostPage.js';
import { projectCost, usageTotals } from './cost-fixtures.js';
import { json, renderPage } from './fake-api.js';
import { history } from './history-fixtures.js';

// RF-428, RNF-010, WCAG 1.4.13, P8-117: Escape closes the exact figure of an amount the pointer rests on or
// that has focus, wherever the key is pressed: a browser sends no key to an amount that is only hovered.

function renderCost(): void {
  const totals = usageTotals({ cost: [{ currency: 'USD', costMicros: '3113515' }] });
  renderPage(
    <ProjectCostPage />,
    {
      'GET /api/projects/p-1/cost': json(200, { ...projectCost, totals }),
      'GET /api/projects/p-1/history': json(200, history),
    },
    undefined,
    { projectId: 'p-1' },
  );
}

/** The wrapper of an amount and its exact figure, which carries `data-dismissed`. */
function wrapOf(amount: HTMLElement): HTMLElement {
  if (amount.parentElement === null) throw new Error('the amount has no wrapper');
  return amount.parentElement;
}

async function amountOfTotals(): Promise<HTMLElement> {
  renderCost();
  const totals = await screen.findByRole('region', { name: 'Project totals' });
  return within(totals).getByText('$3.11');
}

describe('project cost page tooltip closed with Escape', () => {
  it('RF-428 given an amount with an exact figure that only the pointer rests on, Escape pressed anywhere closes it, and it opens again on the next hover', async () => {
    const amount = await amountOfTotals();
    const wrap = wrapOf(amount);
    fireEvent.mouseEnter(wrap);

    await act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    expect(document.activeElement).not.toBe(amount);
    expect(wrap.hasAttribute('data-dismissed')).toBe(true);
    fireEvent.mouseLeave(wrap);
    fireEvent.mouseEnter(wrap);
    expect(wrap.hasAttribute('data-dismissed')).toBe(false);
    expect(wrap.hasAttribute('data-open')).toBe(true);
  });

  it('RF-428 given a focused amount that the pointer rests on, Escape closes it while the amount keeps focus, until the focus moves', async () => {
    const amount = await amountOfTotals();
    const wrap = wrapOf(amount);
    amount.focus();
    fireEvent.mouseEnter(wrap);

    await act(() => {
      fireEvent.keyDown(amount, { key: 'Escape' });
    });

    expect(wrap.hasAttribute('data-dismissed')).toBe(true);
    expect(document.activeElement).toBe(amount);
    fireEvent.mouseLeave(wrap);
    expect(wrap.hasAttribute('data-dismissed')).toBe(true);
    await act(() => {
      amount.blur();
    });
    expect(wrap.hasAttribute('data-dismissed')).toBe(false);
  });

  it('RF-428 given no figure open, Escape leaves the amounts alone', async () => {
    const wrap = wrapOf(await amountOfTotals());

    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.mouseEnter(wrap);

    expect(wrap.hasAttribute('data-dismissed')).toBe(false);
  });
});
