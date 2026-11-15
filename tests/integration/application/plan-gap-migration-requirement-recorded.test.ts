import { describe, expect, it } from 'vitest';
import type { CoverageInput } from '../../../src/application/plan/plan-coverage.js';
import { planLinks } from '../../../src/application/plan/plan-links.js';
import { ev95Calls, ev95Input } from '../../support/eshop-gap-round-fixtures.js';

// P10-14, P10-D6, RF-627, ADR-008: in the eShop plan of P10-11 a requirement that cited two entity
// cards and a feature card was listed only by the migrations card, so it counted as built and the
// gap round never asked for a card that keeps its feature. Here requirement 22 of the recorded eShop
// plan (EV-95) cites the source card of the table `discount_item` and a feature card. Through the
// whole coverage path (the migrations card, the requirement alignment, both gap rounds and the
// check after each), the migrations card never lists it, so it stays an item of the gap rounds.
// tests/recordings/fake/planner-gap-eshop-ev108-requirement.json writes a card that builds it in the
// second round, tests/recordings/fake/planner-gap-eshop-ev108-requirement-open.json writes none.

const built = 'planner-gap-eshop-ev108-requirement.json';
const open = 'planner-gap-eshop-ev108-requirement-open.json';
const migrationsTitle = 'Write the database migrations in the chosen stack';

/** Requirement 22 cites the table's entity card, a rule and a feature card; no card lists it. */
async function input(): Promise<CoverageInput> {
  const base = await ev95Input([22]);
  const { documents, content } = base;
  const tables = documents.dataModel.tables.map((table) =>
    table.name === 'discount_item' ? { ...table, sources: ['ENT-900'] } : table,
  );
  const requirements = content.requirements.map((each) =>
    each.id === 'REQ-022' ? { ...each, sources: ['ENT-900', 'BR-097', 'FEAT-900'] } : each,
  );
  return {
    documents: { ...documents, dataModel: { ...documents.dataModel, tables } },
    content: { ...content, requirements },
  };
}

async function linksOf(recording: string) {
  const { calls, provider } = await ev95Calls(recording);
  const result = await planLinks(calls, await input());
  return { result, provider };
}

const migrationsOf = (result: Awaited<ReturnType<typeof linksOf>>['result']) =>
  result.planned.content.tasks.find((task) => task.title === migrationsTitle);

describe('a requirement with a feature behind it that only the tables reach (P10-14)', () => {
  it('RF-627 the migrations card builds the table but never lists the requirement, after every check', async () => {
    const { result } = await linksOf(open);

    const migrations = migrationsOf(result);
    expect(migrations?.builds).toContain('table:discount_item');
    expect(migrations?.requirements).not.toContain('REQ-022');
  });

  it('RF-627 the gap rounds ask for the requirement and a card that builds it completes the plan', async () => {
    const { result, provider } = await linksOf(built);

    expect(provider.requests).toHaveLength(3);
    expect(result.planned.report.uncovered).toEqual([]);
    const card = result.planned.content.tasks.find(
      (task) => task.title === 'Keep the legacy answer for an update of a missing item',
    );
    expect(card?.requirements).toContain('REQ-022');
    expect(migrationsOf(result)?.requirements).not.toContain('REQ-022');
  });

  it('RF-627 RST-1806 a requirement no gap card builds stays built by no card, so the run is not complete', async () => {
    const { result } = await linksOf(open);

    expect(result.planned.report.uncovered.map((each) => each.id)).toEqual(['requirement:REQ-022']);
    expect(result.warnings.join('\n')).toMatch(
      /1 item\(s\) of the package are built by no task card/u,
    );
  });
});
