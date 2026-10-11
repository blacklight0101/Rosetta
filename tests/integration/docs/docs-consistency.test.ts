import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  countCards,
  parseAdrIndexRows,
  parseAdrStatusLine,
  parseAdrTotals,
  parseCards,
  parseTaskTotals,
} from '../../support/docs-consistency.js';

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

const adrIndex = read('docs/adr/README.md');
const adrFiles = readdirSync(join(ROOT, 'docs/adr')).filter((f) => /^ADR-\d{3}-.*\.md$/.test(f));
const tasks = read('docs/orchestration/tasks.md');
const cards = parseCards(tasks);
const totals = parseTaskTotals(tasks);

describe('ADR index consistency', () => {
  const rows = parseAdrIndexRows(adrIndex);
  const fileStatus = new Map(
    adrFiles.map((f) => [f.slice(0, 7), parseAdrStatusLine(read(`docs/adr/${f}`))]),
  );

  it('RNF-005 the ADR index lists exactly the ADR files', () => {
    expect(rows.map((r) => r.id)).toEqual([...fileStatus.keys()].sort());
  });

  it.each(rows)('RNF-005 $id has the same status in the index and in its file', (row) => {
    expect(fileStatus.get(row.id)).toBe(row.status);
  });

  it('RNF-005 the ADR index Totals line matches the status of every ADR file', () => {
    const statuses = [...fileStatus.values()];
    const count = (s: string): number => statuses.filter((x) => x === s).length;

    expect(parseAdrTotals(adrIndex)).toEqual({
      total: statuses.length,
      Accepted: count('Accepted'),
      Proposed: count('Proposed'),
      Amended: count('Amended'),
      Superseded: count('Superseded'),
    });
  });
});

describe('task card consistency', () => {
  it.each(['P1', 'P2', 'P3', 'Total'])(
    'RNF-005 the tasks.md Totals row %s matches the cards by phase, band and size',
    (phase) => {
      expect(totals.get(phase)).toEqual(countCards(cards, phase));
    },
  );

  it('RNF-005 the tasks.md Totals table has one row per phase of the cards plus the total', () => {
    const phases = [...new Set(cards.map((c) => c.id.slice(0, 2)))];

    expect([...totals.keys()].sort()).toEqual([...phases, 'Total'].sort());
  });

  it('RNF-005 every card id is unique', () => {
    const ids = cards.map((c) => c.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('RNF-005 every Depends on names an existing card', () => {
    const ids = new Set(cards.map((c) => c.id));
    const dangling = cards.flatMap((c) =>
      c.dependsOn.filter((d) => !ids.has(d)).map((d) => `${c.id} -> ${d}`),
    );

    expect(dangling).toEqual([]);
  });
});
