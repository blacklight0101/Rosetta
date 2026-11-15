import type { SourceCard } from '../../../../../src/domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../../../../src/domain/planning/planning-brief.js';

// RF-1406: invented cards and an invented brief for the plan-document lab tests: the messages the
// run's own builders make from them are captured and rendered again by the targets.

export const claimOf = (
  claimId: string,
  text: string,
  extra: Partial<SourceCard['claims'][number]> = {},
): SourceCard['claims'][number] => ({
  ...{ claimId, text, status: 'Supported' as const },
  citations: [{ path: 'src/Shop/Orders.cs', startLine: 10, endLine: 24 }],
  ...extra,
});

export const entity: SourceCard = {
  ...{ id: 'ENT-001', type: 'ENT', title: 'Order', area: 'shop' },
  summary: 'A customer order.',
  claims: [claimOf('ENT-001.c1', 'The `Orders` table holds an Id and a Total.')],
};
export const entityTwo: SourceCard = {
  ...{ id: 'ENT-002', type: 'ENT', title: 'Customer', area: 'shop' },
  summary: 'A customer.',
  claims: [claimOf('ENT-002.c1', 'A customer has a Name.')],
};
export const rule: SourceCard = {
  ...{ id: 'BR-001', type: 'BR', title: 'Late fee', area: 'shop' },
  summary: 'A fee.',
  claims: [claimOf('BR-001.c1', 'A late fee is kept in `Orders`.')],
};
export const feature: SourceCard = {
  ...{ id: 'FEAT-001', type: 'FEAT', title: 'Place an order', area: 'shop' },
  summary: 'Checkout.',
  claims: [claimOf('FEAT-001.c1', 'Checkout creates an order.')],
};
export const flowCard: SourceCard = {
  ...{ id: 'FLOW-001', type: 'FLOW', title: 'Checkout', area: 'shop' },
  summary: 'The buyer pays.',
  flow: { trigger: 'The buyer opens the cart.', outcome: 'An order exists.' },
  claims: [claimOf('FLOW-001.c1', 'The cart is read.', { target: 'FEAT-001' })],
};
export const screenCard: SourceCard = {
  ...{ id: 'SCRN-001', type: 'SCRN', title: 'Cart page', area: 'shop' },
  summary: 'The cart.',
  screen: {
    route: '/Cart',
    roles: ['buyer'],
    fields: [{ name: 'Quantity', inputKind: 'number', required: true }],
    actions: [{ label: 'Pay', handler: 'PayClick' }],
    leadsTo: ['SCRN-002'],
  },
  claims: [claimOf('SCRN-001.c1', 'The route is /Cart.')],
};

export const brief = {
  stack: [
    { layer: 'database', choice: 'SQL Server 2022', custom: false },
    { layer: 'data-access', choice: 'Entity Framework Core 8', custom: false },
    { layer: 'front-end', choice: 'Razor Pages', custom: false },
    { layer: 'backend-framework', choice: 'ASP.NET Core 8 MVC', custom: false },
  ],
  context: { dataMigration: 'Copy the tables once.' },
} as unknown as Pick<PlanningBrief, 'stack' | 'context'>;
