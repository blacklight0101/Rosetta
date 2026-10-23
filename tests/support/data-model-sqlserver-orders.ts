import { readFile } from 'node:fs/promises';
import { parseDataModelAnswer } from '../../src/application/plan/data-model-answer.js';
import { assembleDataModel } from '../../src/domain/planning/data-model-assembly.js';
import { legacyClaimsOf, type TargetDataModel } from '../../src/domain/planning/data-model.js';
import type { SourceCard } from '../../src/domain/planning/plan-sources.js';
import { buildBrief, type PlanningBrief } from '../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from './planning-brief-harness.js';

// P3-120: a synthetic legacy project (SQL strings against tblOrders(id int, status_id int, ...), a
// tblStatus table, the rule "status 6 means deleted"), the brief that chose SQL Server and two
// recorded planner answers for it. Nothing here comes from a real application.

const citation = { path: 'src/Orders/OrderRepository.cs', startLine: 3, endLine: 9 };

export function card(
  id: string,
  type: SourceCard['type'],
  title: string,
  texts: readonly string[],
): SourceCard {
  return {
    ...{ id, type, title, area: 'orders', summary: `${title}.` },
    claims: texts.map((text, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text,
      citations: [citation],
      status: 'Supported' as const,
    })),
  } satisfies SourceCard;
}

export function ordersCards(): SourceCard[] {
  return [
    card('ENT-001', 'ENT', 'Orders', [
      'tblOrders(id int, status_id int, total decimal(10,2)) is read by SELECT id, status_id, total FROM tblOrders.',
    ]),
    card('ENT-002', 'ENT', 'Status', [
      'tblStatus(id int, name varchar(50)) lists the order statuses.',
    ]),
    card('BR-001', 'BR', 'Deleted orders', [
      'Status 6 means deleted: an order whose status_id is 6 is hidden from every list, and the names are read from tblStatus.',
    ]),
  ];
}

export function briefOf(database: string | null, dataMigration?: string): PlanningBrief {
  const stack =
    database === null ? [] : [{ layer: 'database', choice: database, custom: true } as const];
  const built = buildBrief(
    { stack, ...(dataMigration === undefined ? {} : { context: { dataMigration } }) },
    shippedCatalogue,
  );
  return { ...built, savedAt: '2026-10-12T09:30:00.000Z' };
}

/** The model a recorded answer gives once the parser and the domain checks have read it. */
export async function recordedModel(
  kind: 'wrong' | 'right',
  database: string | null = 'SQL Server',
): Promise<TargetDataModel> {
  const url = new URL(
    `../fixtures/planner/data-model-sqlserver-orders-${kind}.json`,
    import.meta.url,
  );
  const parsed = parseDataModelAnswer(await readFile(url, 'utf8'));
  if (parsed === undefined) throw new Error('The recorded answer has no tables');
  return assembleDataModel(parsed.draft, legacyClaimsOf(ordersCards()), database).model;
}
