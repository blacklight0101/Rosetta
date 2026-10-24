import { describe, expect, it } from 'vitest';
import { roundTasks } from '../../../../src/application/deepen/deepen-tasks.js';
import { isEmptyRound, planRound } from '../../../../src/domain/deepen/round-plan.js';
import type { RoundPlan } from '../../../../src/domain/deepen/round-plan.js';
import type { ObjectCoverage } from '../../../../src/domain/cards/database-objects.js';
import type { CodeMap } from '../../../../src/domain/code-map/code-map.js';
import { agentCodeMap } from '../../../support/agent-fixtures.js';
import { cardOf, claimOf, coverageOf, deepenFiles } from '../../../support/deepen-fixtures.js';

// P5-36, RF-209: a Deepen reads the database objects with no card, or named only, before any other
// re-read, and a round with only such objects is not empty.

const sql = 'db/clinic.sql';
const first = agentCodeMap.files[0];
const withSql: CodeMap = {
  ...agentCodeMap,
  files: [
    ...agentCodeMap.files,
    ...(first === undefined ? [] : [{ ...first, path: sql, estimatedTokens: 50, lines: 40 }]),
  ],
  areas: [
    ...agentCodeMap.areas,
    { name: 'db', files: [sql], estimatedTokens: 50, mapLevel: 'symbols', origin: 'folder' },
  ],
};

const object: ObjectCoverage = {
  kind: 'view',
  name: 'TopVisits',
  path: sql,
  startLine: 14,
  endLine: 16,
  state: 'no-card',
  cards: [],
};
const empty: RoundPlan = { judge: [], reread: [], outOfScope: [], gaps: [], failedAreas: [] };

describe('Deepen reads database objects first', () => {
  it('P5-36 a plan with only an uncovered object is not empty', () => {
    expect(isEmptyRound({ ...empty, objects: [object] })).toBe(false);
    expect(isEmptyRound(empty)).toBe(true);
  });

  it('P5-36 planRound lists the objects with no card', () => {
    const plan = planRound({
      cards: [cardOf('db', [claimOf('BR-001.c1', 'Supported', ['src/a.cs'])])],
      coverage: [coverageOf('db', [{ path: 'src/a.cs', read: 100 }])],
      files: deepenFiles,
      reread: new Set(),
      writtenHere: new Set(),
      retriedAreas: new Set(),
      coveragePass: false,
      objects: [{ kind: 'view', name: 'TopVisits', path: sql, startLine: 14, endLine: 16 }],
    });

    expect(plan.objects?.map((o) => o.name)).toEqual(['TopVisits']);
  });

  it('P5-36 the task for an object comes before the other re-reads and carries its lines', () => {
    const plan: RoundPlan = {
      ...empty,
      gaps: [{ path: 'src/Orders/Order.cs', area: 'orders', tokens: 5 }],
      objects: [object],
    };

    const tasks = roundTasks(plan, withSql, 1);

    expect(tasks[0]?.area.files).toEqual([sql]);
    expect(tasks[0]?.unreadRanges).toEqual([
      { path: sql, ranges: [{ startLine: 14, endLine: 16 }], objects: true },
    ]);
    expect(tasks[0]?.agentTaskId).toBe('reader-001');
    expect(tasks[1]?.area.files).toEqual(['src/Orders/Order.cs']);
  });

  it('P5-36 mutation: without the objects in the plan the file is not re-read', () => {
    expect(roundTasks({ ...empty }, withSql, 1)).toEqual([]);
  });
});
