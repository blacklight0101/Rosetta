import { describe, expect, it } from 'vitest';
import {
  databaseObjectsOf,
  objectCoverage,
  uncoveredObjects,
} from '../../../../src/domain/cards/database-objects.js';
import type { ClaimStatus } from '../../../../src/domain/cards/card-vocabulary.js';
import { cardOf, claimOf } from '../../../support/deepen-fixtures.js';
import { entry } from '../../../support/code-map-builders.js';

// P5-36, RF-230, RF-104: every table, view, procedure, trigger and function the scan finds is an
// item of coverage with the card that states what it does, "named only" or "no card".

const path = 'db/clinic.sql';
const files = [entry(path, 100), entry('db/vendor/jquery.min.js', 10)];
const symbols = [
  { path, kind: 'view', name: 'TopVisits', startLine: 14, endLine: 16 },
  { path, kind: 'procedure', name: 'CloseVisit', startLine: 18, endLine: 23 },
  { path, kind: 'class', name: 'NotSql', startLine: 1, endLine: 5 },
  { path: 'db/vendor/jquery.min.js', kind: 'table', name: 'Lib', startLine: 1, endLine: 2 },
] as const;

const objects = databaseObjectsOf({ files, symbols });

function claimAt(
  id: string,
  startLine: number,
  endLine: number,
  status: ClaimStatus = 'Supported',
) {
  return claimOf(id, status, [path], {
    citations: [{ path, startLine, endLine }],
    text: 'Does a thing.',
  });
}

describe('database objects of a code map', () => {
  it('P5-36 lists only database kinds, and none in third-party files', () => {
    expect(objects.map((o) => `${o.kind}:${o.name}`)).toEqual([
      'view:TopVisits',
      'procedure:CloseVisit',
    ]);
  });
});

describe('objectCoverage', () => {
  it('P5-36 names the card whose claim cites lines of the object', () => {
    const card = cardOf('db', [claimAt('BR-001.c1', 20, 21)]);

    const [view, proc] = objectCoverage(objects, [card]);

    expect([view?.state, view?.cards]).toEqual(['no-card', []]);
    expect([proc?.state, proc?.cards]).toEqual(['card', ['BR-001']]);
  });

  it('P5-36 an object only mentioned by name is "named only"', () => {
    const base = cardOf('web', [claimAt('BR-002.c1', 40, 41)]);
    const card = { ...base, summary: 'Calls CloseVisit when the user pays.' };

    const states = objectCoverage(objects, [card]).map((o) => o.state);

    expect(states).toEqual(['no-card', 'named-only']);
  });

  it('P5-36 a Rejected claim does not state the object', () => {
    const card = cardOf('db', [claimAt('BR-001.c1', 14, 16, 'Rejected')]);

    expect(objectCoverage(objects, [card])[0]?.state).toBe('no-card');
  });

  it('P5-36 uncoveredObjects keeps named-only and no-card in code-map order; mutation: no objects, none listed', () => {
    const card = cardOf('db', [claimAt('BR-001.c1', 20, 21)]);

    expect(uncoveredObjects(objects, [card]).map((o) => o.name)).toEqual(['TopVisits']);
    expect(uncoveredObjects([], [card])).toEqual([]);
  });
});
