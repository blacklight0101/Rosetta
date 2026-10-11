import { describe, expect, it } from 'vitest';
import {
  countCards,
  normalizeAdrStatus,
  parseAdrIndexRows,
  parseAdrStatusLine,
  parseAdrTotals,
  parseCards,
  parseTaskTotals,
} from '../../support/docs-consistency.js';

const ADR_INDEX = `
| Id | Title | Status | Date |
|---|---|---|---|
| [ADR-001](ADR-001-x.md) | First | Accepted | 2026-10-09 |
| [ADR-002](ADR-002-x.md) | Second (amended by ADR-012: more) | Amended | 2026-10-09 |

**Totals**: 2 in total - Accepted 1, Proposed 0, Amended 1, Superseded 0.
`;

const TASKS = `
| Phase | Cards | haiku 1-3 | sonnet 4-6 | opus 7-9 | fable 10 | S | M | L | Follow-ups | Withdrawn |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 Milestone slice (M1) | 3 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 0 | 0 |
| P2 Full understand | 1 | 0 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 |
| **Total** | **4** | **1** | **1** | **1** | **1** | **1** | **2** | **1** | **0** | **0** |

### P1-01 - Scaffold
- **Difficulty**: 2 (haiku)
- **Size**: S
- **Depends on**: none
- **Status**: Done

### P1-02 - Pipeline
- **Difficulty**: 5 (sonnet)
- **Size**: M
- **Depends on**: P1-01
- **Status**: Todo; live check Blocked (G-04)

### P1-03 - Engine
- **Difficulty**: 8 (opus)
- **Size**: L
- **Depends on**: P1-01, P1-02
- **Status**: Todo

### P2-01 - Judge
- **Difficulty**: 10 (fable)
- **Size**: M
- **Depends on**: P1-03
- **Status**: Todo
`;

const P1_COUNTS = {
  cards: 3,
  haiku: 1,
  sonnet: 1,
  opus: 1,
  fable: 0,
  s: 1,
  m: 1,
  l: 1,
  followUps: 0,
  withdrawn: 0,
};

describe('docs consistency parsers', () => {
  it('RNF-005 reads the ADR index totals line', () => {
    expect(parseAdrTotals(ADR_INDEX)).toEqual({
      total: 2,
      Accepted: 1,
      Proposed: 0,
      Amended: 1,
      Superseded: 0,
    });
  });

  it('RNF-005 reads the id and status of every ADR index row', () => {
    expect(parseAdrIndexRows(ADR_INDEX)).toEqual([
      { id: 'ADR-001', status: 'Accepted' },
      { id: 'ADR-002', status: 'Amended' },
    ]);
  });

  it.each([
    ['Accepted', 'Accepted'],
    ['Accepted (2026-10-11, DEC-113)', 'Accepted'],
    ['Proposed', 'Proposed'],
    ['Amended', 'Amended'],
    ['Superseded by ADR-012', 'Superseded'],
  ])('RNF-005 normalises the ADR status "%s" to %s', (raw, expected) => {
    expect(normalizeAdrStatus(raw)).toBe(expected);
  });

  it('RNF-005 rejects an ADR status value the index does not use', () => {
    expect(() => normalizeAdrStatus('Draft')).toThrow(/Draft/);
  });

  it('RNF-005 reads the Status line of an ADR file', () => {
    const md = '# ADR-019\n\n**Status**: Accepted (2026-10-11, DEC-113)\n**Date**: x\n';

    expect(parseAdrStatusLine(md)).toBe('Accepted');
  });

  it('RNF-005 reads every card with its fields', () => {
    expect(parseCards(TASKS)).toEqual([
      { id: 'P1-01', title: 'Scaffold', difficulty: 2, size: 'S', dependsOn: [], status: 'Done' },
      {
        id: 'P1-02',
        title: 'Pipeline',
        difficulty: 5,
        size: 'M',
        dependsOn: ['P1-01'],
        status: 'Todo; live check Blocked (G-04)',
      },
      {
        id: 'P1-03',
        title: 'Engine',
        difficulty: 8,
        size: 'L',
        dependsOn: ['P1-01', 'P1-02'],
        status: 'Todo',
      },
      {
        id: 'P2-01',
        title: 'Judge',
        difficulty: 10,
        size: 'M',
        dependsOn: ['P1-03'],
        status: 'Todo',
      },
    ]);
  });

  it('RNF-005 reads the totals table by phase and total', () => {
    const totals = parseTaskTotals(TASKS);

    expect(totals.get('P1')).toEqual(P1_COUNTS);
    expect(totals.get('Total')?.cards).toBe(4);
    expect([...totals.keys()]).toEqual(['P1', 'P2', 'Total']);
  });

  it('RNF-005 counts cards by phase, difficulty band and size', () => {
    const cards = parseCards(TASKS);

    expect(countCards(cards, 'P1')).toEqual(P1_COUNTS);
    expect(countCards(cards, 'Total').fable).toBe(1);
  });

  it('RNF-005 counts follow-up and withdrawn cards', () => {
    const base = { difficulty: 4, size: 'S', dependsOn: [] };
    const cards = [
      { ...base, id: 'P1-90', title: 'Follow-up: fix', status: 'Todo' },
      { ...base, id: 'P1-91', title: 'Gone', status: 'Withdrawn 2026-10-12 - see P1-90' },
    ];

    const counts = countCards(cards, 'P1');

    expect(counts.followUps).toBe(1);
    expect(counts.withdrawn).toBe(1);
  });
});
