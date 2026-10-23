// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { targetFlowDiagram } from '../../../../src/domain/diagrams/target-flow-diagram.js';
import { assembleFlows } from '../../../../src/domain/planning/target-flows-assembly.js';
import { flowCardsOf, type FlowsDraft } from '../../../../src/domain/planning/target-flows.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { parseDiagram } from '../../../support/mermaid-parse.js';

// RF-625, RF-508: the recorded eShopModernizing FLOW-001 (owner review of 2026-10-23). The
// planner placed steps 2 and 5 only; the code places the others by the files they cite, every
// step is drawn in order, and the Mermaid parses.

const steps = [
  ['An HTTP request arrives at the web host started by Program.Main.', 'src/Web/Program.cs'],
  ['Registers the SQL Server catalog database context.', 'src/Web/Data/CatalogDbContext.cs'],
  ['Builds the container for the catalog data.', 'src/Web/Data/CatalogServiceRegistry.cs'],
  ['Selects the controller that handles the request.', 'src/Web/Pages/CatalogController.cs'],
  ['Routes a request with no path to the index page.', 'src/Web/Pages/HomeController.cs'],
] as const;

const card: SourceCard = {
  ...{ id: 'FLOW-001', type: 'FLOW', area: 'web' },
  title: 'Handling an incoming web request',
  summary: 'A request is handled.',
  flow: { trigger: 'An HTTP request arrives at the web host.', outcome: 'The request is served.' },
  claims: steps.map(([text, path], index) => ({
    ...{ claimId: `FLOW-001.c${String(index + 1)}`, text },
    ...{ citations: [{ path, startLine: 1, endLine: 5 }], status: 'Supported' as const },
  })),
};

const draft: FlowsDraft = {
  flows: [
    {
      ...{ card: 'FLOW-001', inScope: true, reason: '' },
      steps: [
        { claim: 'FLOW-001.c2', component: 'Catalog data access', action: 'Registers it.' },
        { claim: 'FLOW-001.c3', component: 'Catalog data access', action: 'Builds it.' },
        { claim: 'FLOW-001.c5', component: 'Catalog web front end', action: 'Routes it.' },
      ],
    },
  ],
};

const described = [
  { name: 'Catalog data access', responsibility: 'Reads and writes the catalog database.' },
  { name: 'Catalog web front end', responsibility: 'Serves the web pages and routes requests.' },
];

function eshop() {
  const { flows } = assembleFlows(draft, flowCardsOf([card]), {
    ...{ components: described.map((each) => each.name), described },
    allCards: [card],
  });
  const [flow] = flows.flows;
  if (flow === undefined) throw new Error('The flow is mapped');
  return flow;
}

describe('the eShop FLOW-001 target flow', () => {
  it('RF-625 places the steps the planner left by the files they cite', () => {
    expect(eshop().steps.map((step) => step.component)).toEqual([
      null,
      'Catalog data access',
      'Catalog data access',
      'Catalog web front end',
      'Catalog web front end',
    ]);
  });

  it('RF-625 marks only the step the code placed as inferred', () => {
    expect(eshop().steps.map((step) => step.inferred)).toEqual([false, false, false, true, false]);
  });

  it('RF-625 draws steps 1 to 5 in order, the trigger as an actor, and Mermaid parses it', async () => {
    const text = targetFlowDiagram(eshop(), (each) => each);

    const parsed = await parseDiagram(text);
    expect(
      parsed.edges
        .filter((edge) => /^[0-9]./u.test(edge.label))
        .map((edge) => edge.label.split('.')[0]),
    ).toEqual(['1', '2', '3', '4', '5']);
    expect(parsed.nodes.map((node) => node.label)).toEqual([
      'Client',
      'Catalog data access',
      'Catalog web front end',
    ]);
    expect(text).toContain('actor p1 as Client');
    expect(text).toContain('Note over p1: An HTTP request arrives at the web host.');
    expect(text.match(/not mapped/gu)).toHaveLength(1);
    expect(text.match(/inferred/gu)).toHaveLength(1);
  });
});
