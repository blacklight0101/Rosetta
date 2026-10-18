import type {
  ApiDraft,
  ApiOperation,
  DraftOperation,
} from '../../src/domain/planning/api-contract.js';
import type { SourceCard } from '../../src/domain/planning/plan-sources.js';
import { buildBrief, type PlanningBrief } from '../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from './planning-brief-harness.js';

// RF-624: the verified cards, the brief and the planner's draft the API contract tests start from.

const citation = { path: 'src/Orders/Checkout.cs', startLine: 3, endLine: 9 };

function card(id: string, type: SourceCard['type'], title: string): SourceCard {
  const claim = { claimId: `${id}.c1`, text: `${title}.`, citations: [citation] };
  return {
    ...{ id, type, title, area: 'orders', summary: `${title}, as the code shows it.` },
    claims: [{ ...claim, status: 'Supported' }],
  };
}

/** A feature, a flow and an entity card, each with one supported claim. */
export function apiCards(): SourceCard[] {
  return [
    card('FEAT-001', 'FEAT', 'Place an order'),
    card('FEAT-002', 'FEAT', 'List customers'),
    card('FLOW-001', 'FLOW', 'Checkout journey'),
    card('ENT-001', 'ENT', 'Order'),
    card('ENT-002', 'ENT', 'Customer'),
  ];
}

/** The planning brief of a project whose front end is this technology (null: none chosen). */
export function briefWithFrontEnd(choice: string | null): PlanningBrief {
  const stack = choice === null ? [] : [{ layer: 'front-end', choice, custom: false }];
  const built = buildBrief({ stack }, shippedCatalogue);
  return { ...built, savedAt: '2026-10-12T09:30:00.000Z' };
}

export function draftOperation(rest: Partial<DraftOperation> = {}): DraftOperation {
  return {
    ...{ operationId: 'listOrders', method: 'get', path: '/orders' },
    ...{ summary: 'Lists the orders.', serves: ['FEAT-001'], public: false },
    ...{ entity: 'ENT-001', list: true, errors: [] },
    ...rest,
  };
}

export function apiDraft(rest: Partial<ApiDraft> = {}): ApiDraft {
  return {
    applies: true,
    reason: '',
    operations: [
      draftOperation(),
      draftOperation({
        ...{ operationId: 'placeOrder', method: 'post', path: '/orders', list: false },
        ...{ summary: 'Places an order.', serves: ['FLOW-001', 'FEAT-001'], errors: [422, 409] },
      }),
      draftOperation({
        ...{ operationId: 'getOrder', path: '/orders/{orderId}', list: false, errors: [404] },
        summary: 'Reads one order.',
      }),
      draftOperation({
        ...{ operationId: 'listCustomers', path: '/customers', entity: 'ENT-002' },
        ...{ summary: 'Lists the customers.', serves: ['FEAT-002'] },
      }),
      draftOperation({
        ...{ operationId: 'signIn', method: 'post', path: '/sessions', public: true },
        ...{ summary: 'Signs a user in.', serves: ['FLOW-001'], entity: null, list: false },
      }),
    ],
    notServed: [],
    ...rest,
  };
}

function operation(rest: Partial<ApiOperation> & Pick<ApiOperation, 'operationId'>): ApiOperation {
  return {
    ...{ method: 'get', path: '/orders', summary: 'Lists the orders.', serves: ['FEAT-001'] },
    ...{ public: false, schema: 'customer_order', list: true, errors: [] },
    ...rest,
  };
}

/** The checked operations of the fixture draft, built by hand so a writer test needs no assembly. */
export function apiOperations(): ApiOperation[] {
  return [
    operation({ operationId: 'listCustomers', path: '/customers', schema: 'customer' }),
    operation({ operationId: 'listOrders' }),
    operation({
      ...{ operationId: 'placeOrder', method: 'post', summary: 'Places an order.' },
      ...{ serves: ['FEAT-001', 'FLOW-001'], list: false, errors: [409, 422] },
    }),
    operation({
      ...{ operationId: 'getOrder', path: '/orders/{orderId}', summary: 'Reads one order.' },
      ...{ list: false, errors: [404] },
    }),
    operation({
      ...{ operationId: 'cancelOrder', method: 'delete', path: '/orders/{orderId}' },
      ...{ summary: 'Cancels an order.', schema: null, list: false },
    }),
    operation({
      ...{ operationId: 'signIn', method: 'post', path: '/sessions', summary: 'Signs in.' },
      ...{ serves: ['FLOW-001'], public: true, schema: null, list: false },
    }),
  ];
}
