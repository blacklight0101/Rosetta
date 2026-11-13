import { render, screen, waitFor } from '@testing-library/preact';
import { journeyEstimateOf } from '../../../src/application/estimate/journey-estimate.js';
import { expect, it } from 'vitest';
import type { RunEstimate } from '../../../web/src/api/estimate-schemas.js';
import { EstimateSection } from '../../../web/src/pages/EstimateSection.js';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage } from './fake-api.js';
import { projectOf } from './project-fixtures.js';

// RF-435, EV-85, P8-03: one cap sentence says which cap applies to a journey step; the project run
// cap is replaced by the journey amount. The two sentences that said the run stops before any call
// that could pass the cap, and that starting approves the worst case, are gone.

const point = { inputTokens: 800, outputTokens: 200, costMicros: '1000' };
const estimate: RunEstimate = {
  ...{ priceTableVersion: '2026-10-11', currency: 'USD', areas: [] },
  assumptions: { turnsPerArea: { low: 2, likely: 3, high: 10 } },
  roles: [
    {
      ...{ role: 'reader', provider: 'openai', kind: 'openai', model: 'priced-model' },
      ...{ keySource: 'user', priced: true, low: point, likely: point, high: point },
    },
  ],
  total: { low: point, likely: point, high: point },
  journey: {
    ...{ basis: 'assumptions', deepenRounds: 3, ceilingApplied: true },
    likely: { tokens: 2_600_000, costMicros: '1200000' },
    worstCase: { tokens: 375_900_000, costMicros: '314170000' },
    approvable: { tokens: 50_000_000, costMicros: '4000000' },
  },
};

it('RF-435 EV-85 the start page has one cap sentence for a journey step and none of the removed ones', () => {
  render(
    <EstimateSection
      scanOnly={false}
      sourceKind="github"
      estimate={{ status: 'ready', estimate }}
      cap={{
        capMicros: 500_000n,
        serverRunCap: { administrator: undefined, serverKeys: false },
        capTokens: 2_000_000,
      }}
      warnings={[]}
      capsHref="/projects/p-1/settings#caps"
      onRetry={() => undefined}
    />,
  );

  const total = screen.getByTestId('journey-total').textContent;
  expect(total).toContain('replaces the project run cap');
  expect(total).toContain('Pressing Analyse again later starts a new approval');
  expect(screen.getByTestId('journey-approved').textContent).toContain('$4.00');
  expect(total).toContain('$314.17');
  expect(document.body.textContent).not.toContain('The run stops before any call that could pass');
  expect(document.body.textContent).not.toContain('Starting approves the worst case');
});

it('RF-435 EV-85 the project settings say which cap applies to a journey step', async () => {
  renderPage(
    <ProjectSettingsPage />,
    { 'GET /api/projects/p-1': json(200, projectOf('p-1', 'octo/demo')) },
    undefined,
    { projectId: 'p-1' },
  );
  await screen.findByRole('heading', { name: 'Project settings' });

  await waitFor(() => {
    expect(document.body.textContent).toContain('replaces the run cap here');
  });
  expect(document.body.textContent).not.toContain('A run stops cleanly when it reaches either cap');
});

const above: RunEstimate = {
  ...estimate,
  journey: {
    ...{ basis: 'history', deepenRounds: 3, ceilingApplied: true },
    likely: { tokens: 3_000_000, costMicros: '4085000' },
    worstCase: { tokens: 9_000_000, costMicros: '9000000' },
    approvable: { tokens: 3_500_000, costMicros: '4000000' },
  },
};

it('RF-434 DEC-210 a likely figure above what can be approved shows the approvable figure and says the run pauses and asks', () => {
  render(
    <EstimateSection
      scanOnly={false}
      sourceKind="github"
      estimate={{ status: 'ready', estimate: above }}
      cap={{
        capMicros: 500_000n,
        serverRunCap: { administrator: undefined, serverKeys: false },
        capTokens: 2_000_000,
      }}
      warnings={[]}
      capsHref="/projects/p-1/settings#caps"
      onRetry={() => undefined}
    />,
  );

  const total = screen.getByTestId('journey-total').textContent;
  expect(total).toContain('$4.00 (likely above what can be approved (likely $4.09))');
  expect(screen.getByTestId('journey-approved').textContent).toContain('$4.00');
  expect(screen.getByTestId('journey-stops').textContent).toContain(
    'the run will pause and ask at the approved amount',
  );
  expect(total).not.toContain('likely $4.09.');
});

it('RF-434 DEC-205 the approved amount is the same on two reads of the same inputs', () => {
  const inputs = {
    understand: {
      low: { inputTokens: 1, outputTokens: 1, costMicros: 1n },
      likely: { inputTokens: 100_000, outputTokens: 20_000, costMicros: 300_000n },
      high: { inputTokens: 400_000, outputTokens: 80_000, costMicros: 900_000n },
    },
    sourceTokens: 50_000,
    deepenRounds: 3,
    history: [],
  };

  expect(journeyEstimateOf(inputs).approvable).toEqual(journeyEstimateOf(inputs).approvable);
  expect(journeyEstimateOf(inputs).approvable).toEqual(journeyEstimateOf({ ...inputs }).worstCase);
});

// RF-434 P9-12 EV-85: with a journey the start page names one limit, the approved amount.
it('RF-434 EV-85 with a journey the cap meter is against the approved amount and no project cap link shows', () => {
  render(
    <EstimateSection
      scanOnly={false}
      sourceKind="github"
      estimate={{ status: 'ready', estimate }}
      cap={{
        capMicros: 500_000n,
        serverRunCap: { administrator: undefined, serverKeys: false },
        capTokens: 2_000_000,
      }}
      warnings={[]}
      capsHref="/projects/p-1/settings#caps"
      onRetry={() => undefined}
    />,
  );

  const meter = screen.getByRole('meter');
  const text = document.getElementById(meter.getAttribute('aria-describedby') ?? '')?.textContent;
  expect(text).toContain('of the approved amount');
  expect(text).not.toContain('of the cap;');
  expect(document.body.textContent).not.toContain('Change the caps in the project settings');
});
