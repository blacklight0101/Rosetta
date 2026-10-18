import type {
  DataModelDraft,
  DraftColumn,
  DraftTable,
  ModelColumn,
  ModelTable,
  TargetDataModel,
} from '../../src/domain/planning/data-model.js';
import type { SourceCard } from '../../src/domain/planning/plan-sources.js';

// RF-623: the legacy `ENT` cards, the planner's draft of the target tables and the checked model
// the data model tests start from. Order has two supported claims and one claim the verifier
// rejected; Customer has three supported claims.

const citation = { path: 'src/Orders/Order.cs', startLine: 3, endLine: 9 };
const statusRisk = 'The legacy status is free text; a value outside the new list is refused.';
const customerKey = { columns: ['customer_id'], references: 'customer', referencedColumns: ['id'] };

type SourceClaim = SourceCard['claims'][number];

function claim(
  cardId: string,
  number: number,
  text: string,
  status: SourceClaim['status'] = 'Supported',
): SourceClaim {
  return { claimId: `${cardId}.c${String(number)}`, text, citations: [citation], status };
}

function entity(id: string, title: string, claims: readonly SourceClaim[]): SourceCard {
  return { ...{ id, type: 'ENT', title, area: 'orders' }, summary: `${title}.`, claims };
}

/** Two `ENT` cards and a `FEAT` card whose claims must never count as legacy fields. */
export function legacyCards(): SourceCard[] {
  return [
    entity('ENT-001', 'Order', [
      claim('ENT-001', 1, 'An order has a status.'),
      claim('ENT-001', 2, 'An order keeps a total.'),
      claim('ENT-001', 3, 'An order keeps the card number.', 'Rejected'),
    ]),
    entity('ENT-002', 'Customer', [
      claim('ENT-002', 1, 'A customer has an email.'),
      claim('ENT-002', 2, 'A customer has a fax number.'),
      claim('ENT-002', 3, 'A customer has a nickname.'),
    ]),
    {
      ...entity('FEAT-001', 'Place an order', [claim('FEAT-001', 1, 'Checkout makes an order.')]),
      type: 'FEAT',
    },
  ];
}

function table(input: Partial<DraftTable> & Pick<DraftTable, 'name'>): DraftTable {
  return {
    ...{ purpose: 'Keeps rows.', sources: [], columns: [], primaryKey: [] },
    ...{ uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
    ...input,
  };
}

function draftColumn(name: string, type: string, rest: Partial<DraftColumn> = {}): DraftColumn {
  return { name, type, nullable: false, legacy: null, risk: '', ...rest };
}

function customerDraft(): DraftTable {
  return table({
    name: 'customer',
    purpose: 'Keeps the people who place orders.',
    sources: ['ENT-002'],
    columns: [
      draftColumn('id', 'uuid'),
      draftColumn('email', 'varchar(200)', { legacy: { claim: 'ENT-002.c1', field: 'Email' } }),
    ],
    primaryKey: ['id'],
    uniqueKeys: [['email']],
  });
}

function orderDraft(): DraftTable {
  return table({
    name: 'customer_order',
    purpose: 'Keeps one order a customer placed.',
    sources: ['ENT-001'],
    columns: [
      draftColumn('id', 'uuid'),
      draftColumn('customer_id', 'uuid'),
      draftColumn('status', 'varchar(20)', {
        legacy: { claim: 'ENT-001.c1', field: 'Status' },
        risk: statusRisk,
      }),
      draftColumn('total', 'numeric(10,2)', {
        nullable: true,
        legacy: { claim: 'ENT-001.c2', field: 'Total' },
      }),
    ],
    primaryKey: ['id'],
    foreignKeys: [customerKey],
    checks: ['total is zero or more'],
    indexes: [
      { columns: ['customer_id'], unique: false, reason: 'Orders are listed by customer.' },
    ],
  });
}

/** The draft: `customer` and `customer_order`, a dropped fax number and one claim left unmapped. */
export function draftModel(): DataModelDraft {
  return {
    tables: [customerDraft(), orderDraft()],
    dropped: [
      {
        ...{ claim: 'ENT-002.c2', field: 'Fax' },
        reason: 'The new system contacts customers by email only.',
      },
    ],
  };
}

function column(name: string, type: string, rest: Partial<ModelColumn> = {}): ModelColumn {
  return { name, type, nullable: false, legacy: null, migrationRisk: '', ...rest };
}

function modelTable(input: Partial<ModelTable> & Pick<ModelTable, 'name'>): ModelTable {
  return {
    ...{ purpose: 'Keeps rows.', sources: [], columns: [], primaryKey: [] },
    ...{ uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
    ...input,
  };
}

function customerModel(): ModelTable {
  const legacy = { cardId: 'ENT-002', claimId: 'ENT-002.c1', field: 'Email' };
  return modelTable({
    name: 'customer',
    purpose: 'Keeps the people who place orders.',
    sources: ['ENT-002'],
    columns: [column('id', 'uuid'), column('email', 'varchar(200)', { legacy })],
    primaryKey: ['id'],
    uniqueKeys: [['email']],
  });
}

function orderModel(): ModelTable {
  const legacy = { cardId: 'ENT-001', claimId: 'ENT-001.c1', field: 'Status' };
  return modelTable({
    name: 'customer_order',
    purpose: 'Keeps one order a customer placed.',
    sources: ['ENT-001'],
    columns: [
      column('id', 'uuid'),
      column('customer_id', 'uuid'),
      column('status', 'varchar(20)', { legacy, migrationRisk: statusRisk }),
      column('total', 'numeric(10,2)', { nullable: true }),
    ],
    primaryKey: ['id'],
    foreignKeys: [customerKey],
    checks: ['total is zero or more'],
    indexes: [
      { columns: ['customer_id'], unique: false, reason: 'Orders are listed by customer.' },
    ],
  });
}

/** The checked model of the same two tables, built by hand so a diagram or writer test needs no assembly. */
export function targetModel(): TargetDataModel {
  return {
    database: 'PostgreSQL',
    tables: [customerModel(), orderModel()],
    dropped: [
      {
        ...{ cardId: 'ENT-002', claimId: 'ENT-002.c2', field: 'Fax', byPlanner: true },
        reason: 'The new system contacts customers by email only.',
      },
      {
        ...{ cardId: 'ENT-002', claimId: 'ENT-002.c3', field: '', byPlanner: false },
        reason:
          'The planner wrote no target column for this legacy statement; confirm whether it is dropped.',
      },
    ],
  };
}
