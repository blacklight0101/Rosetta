import { describe, expect, it } from 'vitest';
import {
  adrModelFindings,
  decisionsNeedingData,
} from '../../../../src/domain/planning/adr-model-check.js';
import type { PlanDecision } from '../../../../src/domain/planning/plan-content.js';

// RF-623, P9-15, EV-108: the decision records the data model is checked against, and what is kept of
// the planner's findings. The records and tables are those of the public eShopModernizing plan.

function decision(id: string, title: string, text = ''): PlanDecision {
  return {
    ...{ id, title, context: '', decision: text, consequences: '', sources: [] },
    ...{ status: 'Proposed' as const, options: [] },
  };
}

const hilo = decision(
  'ADR-001',
  'Hi-lo ids generated in the application',
  'Catalog ids come from the hi-lo sequences.',
);
const style = decision(
  'ADR-002',
  'Keep the catalog rules in one service',
  'The service owns them.',
);
const tables = [{ name: 'catalog' }, { name: 'catalog_brand' }, { name: 'catalog_type' }];

describe('the decision records checked against the data model', () => {
  it('RF-623 P9-15 keeps only the records that name an id strategy or a stored structure', () => {
    const audit = decision(
      'ADR-003',
      'Audit trail',
      'Every change of an item writes an audit row.',
    );
    const accepted = { ...decision('ADR-004', 'Shared schema', ''), status: 'Accepted' as const };

    expect(decisionsNeedingData([hilo, style, audit, accepted]).map((each) => each.id)).toEqual([
      'ADR-001',
      'ADR-003',
      'ADR-004',
    ]);
  });

  it('RF-623 P9-15 a record that names no stored structure is not checked', () => {
    expect(decisionsNeedingData([style])).toEqual([]);
  });
});

describe('the findings of the check', () => {
  it('RF-623 P9-15 names each structure a record needs, sorted by record and structure', () => {
    const missing = [
      { decision: 'ADR-001', structure: 'catalog_type_hilo', reason: 'The type ids.' },
      { decision: 'ADR-001', structure: 'catalog_hilo', reason: 'The item ids.' },
    ];

    const check = adrModelFindings({ missing }, [hilo], tables);

    expect(check).toEqual({
      kind: 'checked',
      dropped: 0,
      findings: [
        {
          decision: 'ADR-001',
          title: hilo.title,
          structure: 'catalog_hilo',
          reason: 'The item ids.',
        },
        {
          ...{ decision: 'ADR-001', title: hilo.title, structure: 'catalog_type_hilo' },
          reason: 'The type ids.',
        },
      ],
    });
  });

  it('RF-623 P9-15 drops and counts a table the model has and a record the call was not sent', () => {
    const missing = [
      { decision: 'ADR-001', structure: 'Catalog_Brand', reason: 'Has it.' },
      { decision: 'ADR-002', structure: 'catalog_style', reason: 'Not sent.' },
      { decision: 'ADR-001', structure: 'catalog_brand_hilo', reason: 'The brand ids.' },
      { decision: 'ADR-001', structure: 'catalog_brand_hilo', reason: 'Again.' },
    ];

    const check = adrModelFindings({ missing }, [hilo], tables);

    expect(check.kind === 'checked' ? check.dropped : -1).toBe(3);
    expect(check.kind === 'checked' ? check.findings.map((each) => each.structure) : []).toEqual([
      'catalog_brand_hilo',
    ]);
  });
});
