import { fireEvent, render, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { estimateSchema } from '../../../web/src/api/estimate-schemas.js';
import { tilesOf, type CodeAreaInfo } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { logCountOf } from '../../../web/src/lib/live-run/log-count.js';
import type { RunState } from '../../../web/src/lib/live-run/run-state.js';
import { AgentPanel } from '../../../web/src/pages/AgentPanel.js';
import { CodeMap } from '../../../web/src/pages/CodeMap.js';
import { CoverageMap } from '../../../web/src/pages/CoverageMap.js';
import { RunMeter } from '../../../web/src/pages/RunMeter.js';
import { SpendPanel } from '../../../web/src/pages/SpendPanel.js';
import {
  agentEnded,
  agentStarted,
  deepenRoundEnded,
  deepenRoundStarted,
  deepenStarted,
  ev,
  planned,
  startedData,
  stateAfter,
  toolCalled,
  toolResult,
} from './live-run-fixtures.js';
import { cloudEstimate, localEstimate } from './start-run-fixtures.js';

// RF-1003, RF-1005, RF-1016, RF-209, RNF-010 (P3-62, owner test 2026-10-20): the wording and the
// layout of the panels of the run page: tiles, spend, estimate, agent cards, coverage, counts.

const caps = { maxCostMicros: 2_000_000, maxTokens: 3_000_000 };
const areas = (names: readonly string[]): readonly CodeAreaInfo[] =>
  names.map((name) => ({ name, estimatedTokens: 5_000, thirdParty: false }));

function codeMapOf(names: readonly string[], state: RunState) {
  const tiles = tilesOf(state, areas(names));
  return render(<CodeMap tiles={tiles} stage="understand" onOpenArea={() => undefined} />);
}

describe('RF-1016 the tiles of the code map', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Asset_Manager.xlsm/macros'),
    agentStarted(2, 'r1', 'Asset_Manager.xlsm/macros'),
  );

  it('RF-1016 shows the part of the name after the last "/", with the full name apart', () => {
    codeMapOf(['Asset_Manager.xlsm/macros', 'Catalog'], state);

    const tile = screen.getByRole('button', { name: /Asset_Manager\.xlsm\/macros/u });
    expect(tile.querySelector('.rst-tile__name')?.textContent).toBe('macros');
    expect(tile.querySelector('.rst-tile__full')?.textContent).toBe('Asset_Manager.xlsm/macros');
    expect(tile.getAttribute('aria-label')).toContain('being read');
  });

  it('RF-1016 adds no full-name element to a tile whose name has no "/"', () => {
    codeMapOf(['Asset_Manager.xlsm/macros', 'Catalog'], state);

    const tile = screen.getByRole('button', { name: /Catalog/u });
    expect(tile.querySelector('.rst-tile__full')).toBeNull();
  });

  it('RF-104 explains the "#1" of a part of a large area', () => {
    codeMapOf(['Asset_Manager.xlsm/Inventory#1'], stateAfter());

    const tile = screen.getByRole('button', { name: /Inventory/u });
    expect(tile.querySelector('.rst-tile__name')?.textContent).toBe('Inventory, part 1');
    expect(tile.getAttribute('aria-label')).toContain('part 1 of an area too large for one agent');
    expect(tile.textContent).not.toContain('#1');
  });

  it('RF-1016 writes the sub-line of a tile in full words', () => {
    codeMapOf(
      ['Catalog'],
      stateAfter(planned(1, 'r1', 'Catalog'), agentStarted(2, 'r1', 'Catalog')),
    );

    const meta = document.querySelector('.rst-tile__words');
    expect(meta?.textContent).toBe('being read · 0 files');
  });

  it('RF-1016 opens the agents of the area under its full name', () => {
    const opened: string[] = [];
    const tiles = tilesOf(state, areas(['Asset_Manager.xlsm/macros']));
    render(<CodeMap tiles={tiles} stage="understand" onOpenArea={(name) => opened.push(name)} />);

    fireEvent.click(screen.getByRole('button', { name: /macros/u }));

    expect(opened).toEqual(['Asset_Manager.xlsm/macros']);
  });
});

describe('RF-1003 the spend for this run', () => {
  const props = { runId: 'r', tokens: 0, caps, onOpenRoles: () => undefined };

  it('RF-1003 labels the bar as cost when there is a cost', () => {
    render(<SpendPanel {...props} costMicros={500_000} tokens={10_000} />);

    const meter = screen.getByRole('meter', { name: 'Spend against the cap' });
    expect(meter.getAttribute('aria-valuenow')).toBe('25');
    expect(screen.getByText('Cost against the cap')).toBeTruthy();
  });

  it('RF-1003 shows the tokens against their cap when the cost is zero and tokens are used', () => {
    render(<SpendPanel {...props} costMicros={0} tokens={1_098_763} />);

    const meter = screen.getByRole('meter', { name: 'Tokens against the cap' });
    expect(meter.getAttribute('aria-valuenow')).toBe('36');
    expect(screen.getByText(/No cost so far/u)).toBeTruthy();
    expect(screen.queryByRole('meter', { name: 'Spend against the cap' })).toBeNull();
  });

  it('RF-1003 shows the cost bar, empty, before anything is used', () => {
    render(<SpendPanel {...props} costMicros={0} tokens={0} />);

    const meter = screen.getByRole('meter', { name: 'Spend against the cap' });
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
  });

  it('RNF-010 gives the button to the roles and the link to the calls one link style', () => {
    render(<SpendPanel {...props} costMicros={0} />);

    const button = screen.getByRole('button', { name: 'Cost per role and estimate' });
    expect(button.className).toContain('rst-button--link');
    expect(screen.getByRole('link', { name: 'API calls and logs' }).getAttribute('href')).toBe(
      '/runs/r/calls',
    );
  });
});

describe('RF-425 the estimate line of the run meter', () => {
  const local = estimateSchema.parse(localEstimate);
  const cloud = estimateSchema.parse(cloudEstimate);
  const used = (input: number, output: number): RunState =>
    stateAfter(
      ev(1, 'run.started', startedData),
      ev(2, 'usage.recorded', {
        role: 'reader',
        tokens: { inputTokens: input, outputTokens: output },
      }),
    );
  const meter = (state: RunState, costMicros: number, estimate = local) =>
    render(<RunMeter state={state} costMicros={costMicros} estimate={estimate} />);

  it('RF-425 gives the range in tokens when a local model makes the dollar range 0 to 0', () => {
    meter(used(1_000, 500), 0);

    const line = screen.getByTestId('estimate-line');
    expect(line.textContent).toContain('44,000 tokens');
    expect(line.textContent).toContain('Range 22,000 to 88,000 tokens.');
    expect(line.textContent).not.toContain('$0.00 to $0.00');
  });

  it('RF-425 adds the dollar range when the run has a price', () => {
    meter(used(1_000, 500), 0, cloud);

    expect(screen.getByTestId('estimate-line').textContent).toContain(
      'Range 22,000 to 88,000 tokens, $0.12 to $0.80.',
    );
  });

  it('RF-425 says the run is over the estimate when tokens pass the likely tokens of a free model', () => {
    meter(used(30_000, 20_000), 0);

    expect(screen.getByTestId('estimate-over').textContent).toBe(
      'Over the estimate: 50,000 tokens used so far against 44,000 likely.',
    );
  });

  it('RF-425 says the run is over the estimate when the cost passes the likely cost', () => {
    meter(used(1_000, 500), 500_000, cloud);

    expect(screen.getByTestId('estimate-over').textContent).toBe(
      'Over the estimate: $0.50 spent so far against $0.39 likely.',
    );
  });

  it('RF-425 says nothing about the estimate while the run is within it', () => {
    meter(used(20_000, 24_000), 0);
    expect(screen.queryByTestId('estimate-over')).toBeNull();
  });

  it('RF-425 says nothing about the estimate when the run is at it exactly', () => {
    meter(used(22_000, 22_000), 0);
    expect(screen.queryByTestId('estimate-over')).toBeNull();
  });
});

describe('RF-209 the agent cards of a Deepen run', () => {
  const deepened = stateAfter(
    ev(1, 'run.started', startedData),
    deepenStarted(2),
    deepenRoundStarted(3, 1),
    planned(4, 'reader-001', 'Asset_Manager.xlsm/macros'),
    agentEnded(5, 'reader-001', 'Done', 1),
    deepenRoundEnded(6, 1),
    deepenRoundStarted(7, 2),
    planned(8, 'reader-002', 'Asset_Manager.xlsm/macros'),
    planned(9, 'reader-003', 'Asset_Manager.xlsm/sheets'),
  );

  it('RF-209 tells the cards of one area apart by the round that planned them', () => {
    const [first, second] = deepened.agents;
    if (first === undefined || second === undefined) throw new Error('two agents expected');
    render(
      <>
        <AgentPanel agent={first} />
        <AgentPanel agent={second} />
      </>,
    );

    expect(screen.getAllByTestId('agent-round').map((each) => each.textContent)).toEqual([
      'Round 1',
      'Round 2',
    ]);
  });

  it('RF-209 adds the round to the accessible name of the card', () => {
    const second = deepened.agents[1];
    if (second === undefined) throw new Error('an agent expected');
    render(<AgentPanel agent={second} />);

    expect(screen.getByLabelText('Agent Asset_Manager.xlsm/macros, round 2')).toBeTruthy();
  });

  it('RF-209 shows no round on the card of a run that is not a Deepen', () => {
    const plain = stateAfter(planned(1, 'reader-001', 'Catalog')).agents[0];
    if (plain === undefined) throw new Error('an agent expected');
    render(<AgentPanel agent={plain} />);

    expect(screen.queryByTestId('agent-round')).toBeNull();
    expect(screen.getByLabelText('Agent Catalog')).toBeTruthy();
  });

  it('RNF-010 keeps the role and the state on one line under the title, whatever the title', () => {
    const second = deepened.agents[1];
    if (second === undefined) throw new Error('an agent expected');
    render(<AgentPanel agent={second} />);

    const panel = screen.getByRole('article');
    const title = panel.querySelector('.rst-live-panel__area');
    const role = panel.querySelector('.rst-live-panel__role');
    const badge = within(panel).getByTestId('status-badge');
    expect(role?.parentElement).toBe(badge.parentElement);
    expect(title?.parentElement).not.toBe(role?.parentElement);
    expect(title?.querySelectorAll('wbr').length).toBeGreaterThan(0);
  });
});

describe('RF-1005 the coverage map', () => {
  it('RF-1005 says "of all files read" for the share of an area', () => {
    const state = stateAfter(
      planned(1, 'r1', 'Catalog'),
      toolCalled(2, 'r1', { path: 'Catalog/a.cs', startLine: 1, endLine: 5 }),
      toolResult(3, 'r1', true),
    );

    render(<CoverageMap state={state} />);

    const region = screen.getByRole('region', { name: 'Coverage of Catalog' });
    expect(region.textContent).toContain('1 file read · 100% of all files read');
    expect(region.textContent).not.toContain('of the reads');
  });
});

describe('RF-1002 the count of the Activity tab', () => {
  const lines = (count: number): RunState['log'] =>
    Array.from({ length: count }, (_, index) => ({
      seq: index + 1,
      at: '2026-10-12T10:00:00.000Z',
      type: 'x',
      text: 'x',
    }));

  it('RF-1002 shows the real count while the log holds every event', () => {
    expect(logCountOf(lines(999))).toBe(999);
    expect(logCountOf(lines(0))).toBe(0);
  });

  it('RF-1002 shows "1,000+" once the log is full, because older events were dropped', () => {
    expect(logCountOf(lines(1_000))).toBe('1,000+');
  });

  it('RF-1002 keeps the newest 1,000 events of a log of more than that', () => {
    const state = stateAfter(
      ...Array.from({ length: 1_050 }, (_, index) => ev(index + 1, 'scan.completed', {})),
    );

    expect(state.log).toHaveLength(1_000);
    expect(logCountOf(state.log)).toBe('1,000+');
  });
});
