import { screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { ProjectCostPage } from '../../../web/src/pages/ProjectCostPage.js';
import { projectCost, usageTotals } from './cost-fixtures.js';
import { failure, json, renderPage } from './fake-api.js';
import { doneKey, history } from './history-fixtures.js';

// RF-428, RF-1010, RF-1105, P1-36: `/projects/:projectId/cost`, the project totals and the breakdown
// by run, stage, role, provider and model from the ledger.

const costPath = 'GET /api/projects/p-1/cost';
const historyPath = 'GET /api/projects/p-1/history';

function renderCost(answer = json(200, projectCost), runs = json(200, history)) {
  return renderPage(<ProjectCostPage />, { [costPath]: answer, [historyPath]: runs }, undefined, {
    projectId: 'p-1',
  });
}

const costOf = (micros: string) => usageTotals({ cost: [{ currency: 'USD', costMicros: micros }] });

const table = (name: string) => screen.findByRole('table', { name });

describe('project cost page', () => {
  it('RF-428 shows the project totals from the ledger', async () => {
    renderCost();

    const totals = await screen.findByRole('region', { name: 'Project totals' });

    expect(screen.getByRole('heading', { name: 'Project cost', level: 1 })).not.toBeNull();
    expect(screen.getByText('octo/webforms')).not.toBeNull();
    expect(totals.textContent).toContain('1,200,000');
    expect(totals.textContent).toContain('80,000');
    expect(totals.textContent).toContain('22,118');
    expect(totals.textContent).toContain('$3.88');
  });

  it('RF-428 breaks the cost down by run, stage, role, provider and model', async () => {
    renderCost();

    for (const name of ['By run', 'By stage', 'By role', 'By provider', 'By model']) {
      expect(await table(name)).not.toBeNull();
    }
    const runs = await table('By run');
    expect(within(runs).getByRole('link', { name: doneKey }).getAttribute('href')).toBe(
      '/runs/r-1',
    );
    expect(within(await table('By stage')).getByText('understand')).not.toBeNull();
    expect(within(await table('By role')).getByText('reader')).not.toBeNull();
  });

  it('RF-428 lists the provider tests as tests, joined to no run and outside the project totals', async () => {
    renderCost();

    const tests = await table('Provider tests');

    const row = within(tests).getByRole('row', { name: /Provider tests/u });
    expect(within(row).queryByRole('link')).toBeNull();
    expect(row.textContent).toContain('$0.0000');
    expect(within(row).getByText('$0.0000').getAttribute('title')).toBe('$0.000007');
    expect(screen.getByText(/not part of this project's totals/u)).not.toBeNull();
    expect(within(await table('By run')).queryByText('Provider tests')).toBeNull();
  });
});

describe('project cost page plan setup', () => {
  it('RF-608 lists the calls of Plan setup, which belong to the project and to no run, as plan setup options', async () => {
    const options = {
      key: 'plan-options',
      runId: null,
      firstAt: '2026-10-12T11:00:00.000Z',
      local: false,
      totals: projectCost.byRun[0]?.totals ?? projectCost.totals,
    };
    renderCost(json(200, { ...projectCost, byRun: [...projectCost.byRun, options] }));

    const runs = await table('By run');

    expect(within(runs).getByText('Plan setup options')).not.toBeNull();
    expect(within(runs).queryByText('Provider tests')).toBeNull();
  });

  it('RF-428 shows no provider tests table when the user has none', async () => {
    renderCost(json(200, { ...projectCost, providerTests: null }));

    await table('By run');

    expect(screen.queryByRole('table', { name: 'Provider tests' })).toBeNull();
  });
});

describe('project cost page lines', () => {
  it('RF-428 shows a local model with its tokens and a cost of zero', async () => {
    renderCost();

    const row = within(await table('By model')).getByRole('row', { name: /gemma4:e4b/u });

    expect(row.textContent).toContain('Local');
    expect(row.textContent).toContain('$0.0000');
    expect(row.textContent).toContain('1,200,000');
  });

  it('RF-428 names the price table each line used and marks an unknown cost', async () => {
    renderCost();

    const row = within(await table('By provider')).getByRole('row', { name: /openai/u });

    expect(row.textContent).toContain('1 call unknown');
  });

  it('RF-1105 shows the error of another user or an unknown project, and no table', async () => {
    renderCost(failure(404, 'RST-2003'));

    const banner = await screen.findByTestId('error-banner');

    expect(banner.textContent).toContain('RST-2003');
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('project cost page run names', () => {
  it('RF-428 names a run as the history page does and not by its identifier', async () => {
    renderCost();

    const runs = await table('By run');

    expect(within(runs).getByRole('link', { name: doneKey })).not.toBeNull();
    expect(runs.textContent).not.toMatch(/(?<![\w-])r-1(?![\w-])/u);
  });

  it('RF-428 names a run by its identifier when the history cannot be read', async () => {
    renderCost(json(200, projectCost), failure(500, 'RST-9000'));

    const runs = await table('By run');

    expect(within(runs).getByRole('link', { name: 'r-1' }).getAttribute('href')).toBe('/runs/r-1');
  });
});

describe('project cost page price table', () => {
  it('RF-428 names the price table once for a table and not on every row', async () => {
    const second = { ...projectCost.byRun[0], key: 'r-2', runId: 'r-2' };
    renderCost(json(200, { ...projectCost, byRun: [...projectCost.byRun, second] }));

    const runs = await table('By run');

    expect(within(runs).queryByRole('columnheader', { name: 'Price table' })).toBeNull();
    expect(runs.textContent).not.toContain('2026-10-11');
    expect(screen.getAllByText('Prices of 11 Oct 2026, for every row below')).toHaveLength(6);
  });

  it('RF-428 keeps a price table column when the rows of a table used different versions', async () => {
    const older = usageTotals({ priceTableVersions: ['2026-10-05'] });
    const rows = [projectCost.byStage[0], { key: 'verify', local: false, totals: older }];
    renderCost(json(200, { ...projectCost, byStage: rows }));

    const stages = await table('By stage');

    expect(within(stages).getByRole('columnheader', { name: 'Price table' })).not.toBeNull();
    expect(within(stages).getByText('5 Oct 2026')).not.toBeNull();
    expect(within(stages).getByText('11 Oct 2026')).not.toBeNull();
  });
});

describe('project cost page money', () => {
  it('RF-428 DEC-54 writes four decimals below a dollar and two above, with the exact figure in a tooltip', async () => {
    const lines = (...micros: string[]) =>
      micros.map((each, at) => ({
        ...{ key: `n-${String(at)}`, runId: null, firstAt: '', local: false },
        totals: costOf(each),
      }));
    renderCost(json(200, { ...projectCost, byRun: lines('3113515', '237000') }));

    const runs = await table('By run');

    expect(within(runs).getByText('$3.11').getAttribute('title')).toBe('$3.113515');
    expect(within(runs).getByText('$0.2370').getAttribute('title')).toBe('$0.237');
    expect(runs.textContent).not.toContain('$3.113515');
  });

  it('RF-428 writes the project total through the same formatter', async () => {
    renderCost(json(200, { ...projectCost, totals: costOf('3113515') }));

    const totals = await screen.findByRole('region', { name: 'Project totals' });

    expect(within(totals).getByText('$3.11').getAttribute('title')).toBe('$3.113515');
  });
});
