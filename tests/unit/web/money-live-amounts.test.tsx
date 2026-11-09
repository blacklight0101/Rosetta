import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { TotalsPill } from '../../../web/src/components/TotalsPill.js';
import { endFactsOf } from '../../../web/src/lib/live-run/end-facts.js';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { AgentPanel } from '../../../web/src/pages/AgentPanel.js';
import { JourneyStrip } from '../../../web/src/pages/JourneyStrip.js';
import { PackageSection } from '../../../web/src/pages/PackageSection.js';
import { PlanCalls } from '../../../web/src/pages/PlanCalls.js';
import { RunFacts } from '../../../web/src/pages/RunFacts.js';
import { RunMeter } from '../../../web/src/pages/RunMeter.js';
import { SpendPanel } from '../../../web/src/pages/SpendPanel.js';
import { YourTurn } from '../../../web/src/pages/YourTurn.js';
import { adminTotals, usageTotals } from './cost-fixtures.js';
import { renderPage } from './fake-api.js';
import { planRun, projectId, roadSigns, source } from './journey-fixtures.js';
import { agentStarted, ev, planned, startedData, stateAfter } from './live-run-fixtures.js';

// RF-428, RNF-010, DEC-54, DEC-217, P8-91: the amount a run has spent stands on the other pages as it
// does on the cost page: written by the one formatter, with the exact figure in a tooltip, so rounding
// as $3.11 for $3.113515 loses nothing. The amounts of a table take one Tab stop.

afterEach(cleanup);

const usage = (seq: number, agent: string, role: string, costMicros: number) =>
  ev(seq, 'usage.recorded', { callId: `c#${String(seq)}`, role, costMicros }, agent);

const state = stateAfter(
  ev(1, 'run.started', startedData),
  planned(2, 'reader-001', 'Catalog'),
  ev(3, 'agent.planned', { area: 'all', role: 'verifier', model: 'm' }, 'v-1'),
  agentStarted(4, 'reader-001', 'Catalog'),
  usage(5, 'reader-001', 'reader', 3_113_515),
  usage(6, 'v-1', 'verifier', 237_000),
);

const tipsOf = (root: HTMLElement): (string | null)[] =>
  within(root)
    .queryAllByRole('tooltip')
    .map((tip) => tip.textContent);
const stopsOf = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>('[data-rst-amount]')].filter(
    (amount) => amount.getAttribute('tabindex') === '0',
  );

const oneRun = stateAfter(ev(1, 'run.started', startedData));

describe('the live run', () => {
  it('RF-428 the role table gives each cost its exact figure and one Tab stop that follows the focus', async () => {
    render(<RunMeter state={state} costMicros={3_350_515} estimate={undefined} />);

    const table = screen.getByRole('table', { name: 'Tokens and cost per role' });
    expect(tipsOf(table)).toEqual(['$3.113515', '$0.237', '$3.350515']);
    const amounts = [...table.querySelectorAll<HTMLElement>('[data-rst-amount]')];
    expect(stopsOf(table)).toEqual([amounts[0]]);
    fireEvent.focus(amounts[1] ?? table);
    await waitFor(
      () => {
        expect(stopsOf(table)).toEqual([amounts[1]]);
      },
      { timeout: 500 },
    );
  });

  it('RF-428 the spend panel gives the cost of the run its exact figure', () => {
    render(
      <SpendPanel
        runId="r-1"
        costMicros={3_113_515}
        tokens={10}
        caps={undefined}
        onOpenRoles={() => undefined}
      />,
    );

    const panel = screen.getByRole('region', { name: 'Spend for this run' });
    expect(tipsOf(panel)).toEqual(['$3.113515']);
    expect(stopsOf(panel)).toHaveLength(1);
  });
});

describe('the facts of a run', () => {
  it('RF-428 the facts of an ended run give the cost its exact figure', () => {
    render(<RunFacts facts={endFactsOf(oneRun)} costMicros={3_113_515} state={oneRun} />);

    expect(tipsOf(screen.getByRole('list', { name: 'Run facts' }))).toEqual(['$3.113515']);
  });

  it('RF-428 the panel of an agent gives its cost its exact figure', () => {
    const [agent] = state.agents;
    if (agent === undefined) throw new Error('The run has no agent.');
    render(<AgentPanel agent={agent} />);

    expect(tipsOf(screen.getByLabelText('Agent Catalog'))).toEqual(['$3.113515']);
  });

  it('RF-428 the planner calls give each cost its exact figure', () => {
    const plan = stateAfter(
      ev(1, 'run.started', startedData),
      ev(2, 'plan.call.started', { call: 'prd' }, 'planner-prd'),
      usage(3, 'planner-prd', 'planner', 3_113_515),
    );
    renderPage(<PlanCalls runId="r-1" state={plan} />, {});

    expect(tipsOf(screen.getByRole('list', { name: 'Planner calls' }))).toEqual(['$3.113515']);
  });

  it('RF-428 the Your turn panel of a plan run gives the cost its exact figure', () => {
    renderPage(
      <YourTurn
        state={oneRun}
        costMicros={3_113_515}
        failed={false}
        asks={false}
        answers={{ status: 'waiting' }}
        onAnswer={() => undefined}
        run={{ id: 'r-1', projectId }}
        stage="plan"
      />,
      {},
    );

    expect(tipsOf(screen.getByRole('region', { name: 'Your turn' }))).toEqual(['$3.113515']);
  });
});

describe('the journey', () => {
  const written = roadSigns['written'];
  if (written === undefined) throw new Error('The fixtures have no written package.');
  const view = journeyOf(
    {
      ...written,
      source: source({ costMicros: 3_113_515 }),
      plan: planRun({ costMicros: 237_000 }),
    },
    projectId,
  );

  it('RF-428 the strip gives the cost of each step and the total their exact figures', () => {
    renderPage(
      <JourneyStrip view={view} onResumed={() => undefined} onAnswer={undefined} alwaysExpanded />,
      {},
    );

    const strip = screen.getByRole('region', { name: 'Journey from code to package' });
    expect(tipsOf(strip)).toEqual(['$3.113515', '$0.237', '$3.350515']);
  });

  it('RF-428 the journey cost of the package gives the total and the steps their exact figures', () => {
    renderPage(<PackageSection view={view} />, {});

    const cost = screen.getByText('Journey cost').closest('div');
    expect(tipsOf(cost ?? document.body)).toEqual(['$3.350515', '$3.113515', '$0.237']);
  });
});

describe('the header', () => {
  const own = {
    totals: usageTotals({ cost: [{ currency: 'USD', costMicros: '3113515' }] }),
    local: false,
    server: null,
  };

  it('RF-428 gives the server month and its cap their exact figures', () => {
    render(<TotalsPill totals={adminTotals('8123456')} />);

    const server = screen.getByTestId('header-server-month');
    expect(tipsOf(server)).toEqual(['$8.123456']);
    expect(server.textContent).toContain('$8.12');
  });

  it('RF-428 gives the cost of the user a tooltip when no link holds it', () => {
    render(<TotalsPill totals={own} />);

    expect(screen.getAllByRole('tooltip').map((tip) => tip.textContent)).toEqual(['$3.113515']);
  });

  it('RF-428 puts the exact cost in the title of the link that holds it, not in a second tab stop', () => {
    render(<TotalsPill totals={own} href="/projects/p-1/cost" />);

    const link = screen.getByRole('link');
    expect(link.querySelector('[title="$3.113515"]')).not.toBeNull();
    expect(within(link).queryByRole('tooltip')).toBeNull();
    expect(link.querySelector('[data-rst-amount]')).toBeNull();
  });
});
