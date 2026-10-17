import { describe, expect, it } from 'vitest';
import { parseGoldenSet } from '../../../../src/application/eval/golden-set-schema.js';

// RF-260, RF-261, RF-262, RNF-006: the golden set also holds the steps of the expected flows, the
// fields and actions of the expected screens and the relations of the entities. Each says which
// journey, screen or entity it belongs to (`of`), so the file reads as flows, screens and a model.

const commit = 'a'.repeat(40);

function setWith(finding: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: 1,
    version: '2026-10-17.1',
    description: 'A small golden set.',
    source: { url: 'https://github.com/octo/demo', commit, subpath: '' },
    cases: [
      {
        id: 'home',
        title: 'The home page',
        paths: ['Default.aspx.cs'],
        findings: [
          {
            statement: 'x',
            cardTypes: ['FLOW'],
            keywords: ['grid'],
            evidence: ['Default.aspx.cs:9-12'],
            ...finding,
          },
        ],
        absences: [{ id: 'absent-x', statement: 'x', claimPatterns: [['paging']], unless: [] }],
      },
    ],
  };
}

describe('the golden set file: flows, screens and the data model', () => {
  it.each(['step', 'field', 'action', 'relation'])(
    'RF-260 RF-261 RF-262 reads a %s that names what it belongs to',
    (kind) => {
      const parsed = parseGoldenSet(
        setWith({ id: `${kind}-one`, kind, of: 'Browse the catalogue' }),
      );

      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.cases[0]?.findings[0]).toMatchObject({
        kind,
        of: 'Browse the catalogue',
      });
    },
  );

  it.each(['step', 'field', 'action', 'relation'])(
    'RF-260 RF-261 RF-262 refuses a %s that does not say what it belongs to',
    (kind) => {
      const parsed = parseGoldenSet(setWith({ id: `${kind}-one`, kind }));

      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.error.join(' ')).toContain(`home.${kind}-one`);
    },
  );

  it('RNF-006 still reads a feature, a rule and an entity without it', () => {
    const parsed = parseGoldenSet(setWith({ id: 'rule-one', kind: 'rule' }));

    expect(parsed.ok).toBe(true);
  });
});
